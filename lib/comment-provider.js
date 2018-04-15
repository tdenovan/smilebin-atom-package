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

  async createComment(filePath, commentText, emoticon, startLine, endLine) {
    // First let's get the repo id
    const repo = await repositoryForEditorPath(filePath)
    const repoUrl = getHostnameFromGitUrl(repo.getOriginURL())
    const repoId = await this._getOrCreateRepo(repoUrl)
    const cleanedFilePath = repo.relativize(filePath)
    const gitUtil = this._getGitCommander(repo)
    const userId = this.authenticationProvider.getIdentity().id

    // Get the commit for this line
    // TODO handle multiple commits
    const commit = await gitUtil.commitForLine(cleanedFilePath, `${startLine},${endLine}`)

    // Check if line has been commited before
    if (commit === '0000000000000000000000000000000000000000') {
      // TODO show error message using notificationManager
      console.log('new line, never been commited before')
      return
    }

    const fileChecksums = await gitUtil.getFileChecksumsFromCommits(cleanedFilePath, [ commit ])

    // Update file numbers to be relative to that commit
    const diff = await gitUtil.diff(cleanedFilePath, commit)
    const parsedDiff = parseDiff(diff)[0]
    const updatedStartLine = _.findKey(parsedDiff.lineTranslations, ln => ln === startLine)
    const updatedEndLine = _.findKey(parsedDiff.lineTranslations, ln => ln === endLine)

    return this.apolloClient.mutate({
      mutation: gql`
        mutation($startLine: Int!, $endLine: Int!, $repoId: Int!, $fileHash: String!,
          $commitHash: String!, $emoticon: String, $text: String, $userId: Int!) {
          createComment(input:{
            comment:{
              comment: $text,
              startLineNumber: $startLine,
              endLineNumber: $endLine,
              emoticon: $emoticon,
              repositoryId: $repoId,
              fileHash: $fileHash,
              commitHash: $commitHash,
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
        startLine: updatedStartLine,
        endLine: updatedEndLine,
        repoId,
        fileHash: fileChecksums[0],
        commitHash: commit,
        emoticon,
        text: commentText,
        userId
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
      const diff = await gitUtil.diff(filePath, comment.commitHash)
      const parsedDiff = parseDiff(diff)[0]

      comment.startLineNumber = parsedDiff.lineTranslations[comment.startLineNumber]
      comment.endLineNumber = parsedDiff.lineTranslations[comment.endLineNumber]
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
              commitHash,
              comment,
              emoticon
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
        mutation($repoUrl: String!, userId: Int!){
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

    await this.apolloClient.mutate({
      mutation: gql`
        mutation($repoId: Int!, userId: Int!) {
          createRepositoryUser(input:{
            repositoryUser:{
              userId: $userId,
              repositoryId: $repoId
            }
          }) {
            repositoryUser {
              id
            }
          }
        }
      `,
      variables: { repoId: result.data.createRepository.repository.id, userId }
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
