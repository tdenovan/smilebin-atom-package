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

  constructor ({notificationManager, workspace, apolloClient}) {
    this.apolloClient = apolloClient
    this.notificationManager = notificationManager
    this.workspace = workspace
    this.gitCommanders = {}
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

  /**
  * Fetches comments from the server for the given file
  *
  * First retrieves the list of commits / file hashes from the given file
  * @method fetchComments
  */
  async fetchComments(filePath) {
    try {
      const repo = await repositoryForEditorPath(filePath)

      // Check that the file path exists in the git index, otherwise we won't have
      // comments for it
      if (!repo.isPathModified(filePath)) return []

      const gitUtil = this._getGitCommander(repo)
      const cleanedFilePath = repo.relativize(filePath)

      const commits = await gitUtil.getCommits(cleanedFilePath)
      const fileChecksums = await gitUtil.getFileChecksumsFromCommits(cleanedFilePath, commits)
      const hashes = this._combineCommitAndFileHashes(commits, fileChecksums)
      const repoUrl = getHostnameFromGitUrl(repo.getOriginURL())
      const queryResult = await this._queryComments(repoUrl, hashes)

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
  async _queryComments(repoUrl, hashes) {
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
      variables: { repoUrl, hashes }
    })
  }

}
