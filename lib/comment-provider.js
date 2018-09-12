/**
 * Class that is used to fetch comments from the server
 */

const gql = require('graphql-tag')
const { getHostnameFromGitUrl, repositoryForEditorPath } = require('./git-repository')
const GitCommander = require('./git-commander')
const _ = require('lodash')
const parseDiff = require('smilebin-parse-diff')

module.exports =
class CommentProvider {

  constructor({
    notificationManager,
    workspace,
    apolloClient,
    authenticationProvider,
    apolloNetworkErrorManager
  }) {
    this.apolloClient = apolloClient
    this.notificationManager = notificationManager
    this.workspace = workspace
    this.gitCommanders = {}
    this.authenticationProvider = authenticationProvider
    this.apolloNetworkErrorManager = apolloNetworkErrorManager
  }

  /**
   * Helper method to get or initialise git commander
   * @method _getGitCommander
   */
  _getGitCommander(repo) {
    const repoPath = repo.getWorkingDirectory()

    if (!this.gitCommanders[repoPath]) {
      this.gitCommanders[repoPath] = new GitCommander(repoPath)
    }

    return this.gitCommanders[repoPath]
  }

  /**
   * Helper method to concatenate commit hashes with their file checksums based
   * on the array indices
   * @method _combineCommitAndFileHashes
   */
  _combineCommitAndFileHashes(commits, fileChecksums) {
    return _.map(commits, (commit, i) => (
      `${commit}${fileChecksums[i]}`
    ))
  }

  async deleteComment(commentId) {
    return this.apolloClient.mutate({
      mutation: gql`
        mutation($commentId: Int!) {
          deleteCommentById(input: {
            id: $commentId
          }) {
            comment {
              id
            }
          }
        }
      `,
      variables: { commentId }
    })
  }

  /**
   * Helper method to get gitUtil and cleaned file path from a filename
   * @method _getGitUtilAndCleanedFilePath
   */
  async _getGitUtilAndCleanedFilePath(filePath) {
    const repo = await repositoryForEditorPath(filePath)
    const gitUtil = this._getGitCommander(repo)
    const cleanedFilePath = repo.relativize(filePath)

    return { repo, gitUtil, cleanedFilePath }
  }

  /**
   * Determines whether or not a comment can be created for the given line range
   *
   * Specifically, checks whether or not the lines have been committed to git
   *
   * Optionally displays a notification if creating a comment is not possible
   * @method canCreateComment
   * @param  {Number}         startLine Start line number
   * @param  {Number}         endLine   End line number
   */
  async canCreateComment(filePath, startLine, endLine, displayNotification = false) {
    const { gitUtil, cleanedFilePath } = await this._getGitUtilAndCleanedFilePath(filePath)
    const commits = await gitUtil.commitsForLineRange(cleanedFilePath, `${startLine},${endLine}`)
    return this._canCreateCommentFromCommits(commits, displayNotification)
  }

  /**
   * Helper method for testing whether commits are valid and optionally displaying notifiations
   * @method _canCreateCommentFromCommits
   */
  async _canCreateCommentFromCommits(commits, displayNotification) {
    // Validate commits
    const invalidCommit = _.find(commits, x => x.hash === '0000000000000000000000000000000000000000')

    if (displayNotification && invalidCommit) {
      const notification = this.notificationManager.addInfo('Cannot add comment', {
        description: 'The selected code has not been committed to git yet',
        dismissable: true
      })
      setTimeout(() => notification.dismiss(), 5000) // TODO move this to a global class
    }

    return !invalidCommit
  }

  async createComment(filePath, commentText, emoticon, startLine, endLine, codeSnippet) {
    // First let's get the repo id
    const { gitUtil, cleanedFilePath, repo } = await this._getGitUtilAndCleanedFilePath(filePath)
    const repoUrl = getHostnameFromGitUrl(repo.getOriginURL())
    const repoId = await this._getOrCreateRepo(repoUrl)
    const userId = this.authenticationProvider.getIdentity().id

    // Get the commit for this line
    const commits = await gitUtil.commitsForLineRange(cleanedFilePath, `${startLine},${endLine}`)

    // Validate that commits are valid
    if (!this._canCreateCommentFromCommits(commits, true)) {
      return
    }

    const fileChecksums = await gitUtil.getFileChecksumsFromCommits(cleanedFilePath, _.map(commits, 'hash'))

    // Update file numbers to be relative to the commits
    const totalLines = await gitUtil.totalLines(cleanedFilePath)
    await _.each(commits, async (commit, index) => {
      const diff = await gitUtil.diff(cleanedFilePath, commit.hash)
      const parsedDiff = parseDiff(diff, totalLines)[0]
      commit.updatedStartLine = _.findKey(parsedDiff.lineTranslations, ln => ln === commit.startLine)
      commit.updatedEndLine = _.findKey(parsedDiff.lineTranslations, ln => ln === commit.endLine)
      commit.fileHash = fileChecksums[index]
      commit.sequence = index
    })

    // First create the comment, then we can create the comment addresses based on the commit hash
    const comment = await this._createComment({ startLine, endLine, repoId, emoticon, commentText, userId, codeSnippet})
    const commentId = comment.data.createComment.comment.id

    return Promise.all(_.map(commits, commit => {
      return this._createCommentAddress({
        commentId,
        startLine: commit.updatedStartLine,
        endLine: commit.updatedEndLine,
        commitHash: commit.hash,
        fileHash: commit.fileHash,
        sequence: commit.sequence
      })
    }))
  }

  /**
   * Helper method to create comment address
   * @method _createCommentAddress
   */
  _createCommentAddress({ commentId, startLine, endLine, commitHash, fileHash, sequence }) {
    return this.apolloClient.mutate({
      mutation: gql`
        mutation($startLine: Int!, $endLine: Int!, $commentId: Int!, $fileHash: String!,
          $commitHash: String!, $sequence: Int!) {
          createCommentAddress(input:{
            commentAddress:{
              sequence: $sequence,
              startLineNumber: $startLine,
              endLineNumber: $endLine,
              commitHash: $commitHash,
              fileHash: $fileHash,
              commentId: $commentId
            }
          }) {
            commentAddress {
              id
            }
          }
        }
      `,
      variables: {
        startLine,
        endLine,
        commentId,
        sequence,
        commitHash,
        fileHash
      }
    })
  }

  /**
   * Helper method for creating a comment via graphql
   * @method _createComment
   */
  _createComment({ startLine, endLine, repoId, emoticon, commentText, userId, codeSnippet }) {
    return this.apolloClient.mutate({
      mutation: gql`
        mutation($startLine: Int!, $endLine: Int!, $repoId: Int!,
          $codeSnippet: String!,
          $emoticon: String, $text: String, $userId: Int!) {
          createComment(input:{
            comment:{
              comment: $text,
              startLineNumber: $startLine,
              endLineNumber: $endLine,
              emoticon: $emoticon,
              repositoryId: $repoId,
              codeSnippet: $codeSnippet,
              userId: $userId
            }
          }) {
            comment {
              id
            }
          }
        }
      `,
      variables: {
        startLine,
        endLine,
        repoId,
        emoticon,
        text: commentText,
        userId,
        codeSnippet
      }
    })
  }

  /**
  * Fetches comments from the server for the given file
  *
  * First retrieves the list of commits / file hashes from the given file
  * @method fetchComments
  */
  async fetchComments(filePath, isForceFetch) {
    try {
      // Do not proceed if the network is down / not responding
      if (this.apolloNetworkErrorManager.hasError()) return []
      if (!this.authenticationProvider.isSignedIn()) return []

      const repo = await repositoryForEditorPath(filePath)

      // Check that the file path exists in the git index, otherwise we won't have
      // comments for it
      if (repo.isPathNew(filePath) || repo.isPathIgnored(filePath)) return []

      const gitUtil = this._getGitCommander(repo)
      const cleanedFilePath = repo.relativize(filePath)

      const commits = await gitUtil.getCommits(cleanedFilePath)
      const fileChecksums = await gitUtil.getFileChecksumsFromCommits(cleanedFilePath, commits)
      const hashes = this._combineCommitAndFileHashes(commits, fileChecksums)
      const repoUrl = getHostnameFromGitUrl(repo.getOriginURL())
      const queryResult = await this._queryComments(repoUrl, hashes, isForceFetch)

      if (!queryResult.data.fetchComments) return []

      // We have the comments, now we just need to update their line numbers
      // to take into account any changes to the file
      const comments = queryResult.data.fetchComments.nodes
      const updatedComments = await this._updateLineNumbers(repo, cleanedFilePath, comments)

      return updatedComments
    } catch (err) {
      console.error('Error fetching comments')
      console.error(err)
      return []
    }
  }

  /**
   * Updates line numbers that were based on an older commit to reflect any changes
   * to the file since then
   * @method _updateLineNumbers
   */
  async _updateLineNumbers(repo, filePath, comments) {
    for (let comment of comments) {
      const gitUtil = this._getGitCommander(repo)
      const addresses = comment.commentAddressesByCommentId.nodes
      let diff = await gitUtil.diff(filePath, addresses[0].commitHash)
      const parsedStartLineDiff = parseDiff(diff)[0]
      const lastAddress = addresses[addresses.length - 1]
      diff = await gitUtil.diff(filePath, lastAddress.commitHash)
      const parsedEndLineDiff = parseDiff(diff)[0]

      // TODO check that any addresses between the start and end line still exist
      comment.startLineNumber = parsedStartLineDiff.lineTranslations[addresses[0].startLineNumber]
      comment.endLineNumber = parsedEndLineDiff.lineTranslations[lastAddress.endLineNumber]
    }

    return comments
  }

  /**
   * Method to query backend using apollo
   * @method _queryComments
   */
  async _queryComments(repoUrl, hashes, isForceFetch) {
    return this.apolloClient.query({
      query: gql`
        query CommentsForFile($repoUrl: String!, $hashes: [String]!) {
          fetchComments(repoUrl: $repoUrl, hashes: $hashes) {
            nodes {
              id
              endLineNumber,
              startLineNumber,
              comment,
              emoticon
              commentAddressesByCommentId {
                nodes {
                  startLineNumber
                  endLineNumber
                  commitHash
                  fileHash
                  sequence
                }
              }
            }
          }
        }
      `,
      fetchPolicy: isForceFetch ? 'network-only' : null,
      variables: { repoUrl, hashes }
    })
  }

  /**
   * Fetches repo id based on its url
   * @method _getRepo
   */
  async _getRepo(repoUrl) {
    return this.apolloClient.query({
      query: gql`
        query repoByUrl($repoUrl: String!) {
          allRepositories(first: 1, condition:{
            url: $repoUrl
          }) {
            nodes {
            	id
          	}
          }
        }
      `,
      fetchPolicy: 'network-only',
      variables: { repoUrl }
    })
  }

  /**
   * Creates a repo and adds the current user to it
   * @method _createRepo
   */
  async _createRepo(repoUrl) {
    const userId = this.authenticationProvider.getIdentity().id
    const result = await this.apolloClient.mutate({
      mutation: gql `
        mutation($repoUrl: String!, $userId: Int!){
          createRepository(input: {
            repository:{ url: $repoUrl, ownerUserId: $userId}
          }) {
            repository {
              id
            }
          }
        }
      `,
      variables: { repoUrl, userId }
    })

    return result.data.createRepository.repository
  }

  /**
   * Fetches or creates a repo
   * @method _getOrCreateRepo
   */
  async _getOrCreateRepo(repoUrl) {
    const repoResult = await this._getRepo(repoUrl)

    if (repoResult.data.allRepositories.nodes.length === 0) {
      const createdRepo = await this._createRepo(repoUrl)
      return createdRepo.id
    }
    return repoResult.data.allRepositories.nodes[0].id

  }

}
