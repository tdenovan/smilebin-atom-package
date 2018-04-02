'use babel';

const { CompositeDisposable, Point } = require('atom')
const _ = require('lodash')

/**
 * Contains logic for drawing smiles (comments)
 */

module.exports =
class SmilebinAtomView {

  constructor(options) {
    const { commentProvider, workspace } = options

    this.options = options
    this.commentProvider = commentProvider
    this.workspace = workspace
    this.markers = []
    this.fetchedComments = []

    this._setupSubscriptions()
    this._fetchAndShowComments()
  }

  // Tear down any state and detach
  destroy() {
    this.subscriptions.dispose()
    this._resetView()
  }

  // Toggles a smiley face on the current line
  async toggleSmiley() {
    const editor = this._getEditor()
    const range = editor.getSelectedScreenRange()

    // Get the current line and check if it has a comment on it
    const startLine = range.start.row + 1
    const endLine = range.end.row + 1

    // Check if there is an existing comment
    const existingComment = _.find(editor.findMarkers({
      startBufferRow: range.start.row,
      endBufferRow: range.end.row
    }), (mk) => Boolean(mk.commentId))

    if (existingComment) {
      await this.deleteComment(existingComment.commentId)
    } else {
      await this.createComment('', 'thumbsup', startLine, endLine)
    }

    this._fetchAndShowComments(true)
  }

  // Creates a comment
  async createComment(commentText, emoticon, startLine, endLine) {
    const editor = this._getEditor()
    const filePath = editor.isEmpty() ? null : editor.getPath()
    await this.commentProvider.createComment(filePath, commentText, emoticon, startLine, endLine)
  }

  /**
   * Deletes a comment
   * @method deleteComment
   * @param  {comment}      comment comment record
   */
  async deleteComment(commentId) {
    // Delete comment on server
    return this.commentProvider.deleteComment(commentId)
  }

  // Helper method to setup subscriptions
  _setupSubscriptions() {
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(
      this.workspace.onDidChangeActivePaneItem(() => this._fetchAndShowComments())
    )
  }

  _getEditor() {
    return this.workspace.getActiveTextEditor()
  }

  /**
   * Deletes any existing markers
   * @method _resetView
   */
  _resetView() {
    for (let decoration of this.markers) {
      decoration.destroy()
    }

    this.markers = []
    this.fetchedComments = []
  }

  /**
   * Creates a marker
   * @method _renderComments
   */
  _renderComments(comment) {
    if (!comment.startLineNumber || !comment.endLineNumber) return

    const range = [[comment.startLineNumber - 1, 0], [comment.endLineNumber - 1, 0]]
    const marker = this._getEditor().markBufferRange(range)
    const decoration = this._getEditor().decorateMarker(
      marker,
      { type: 'line-number', class: `icon-${comment.emoticon}`}
    )
    marker.commentId = comment.id

    this.markers.push(marker)
  }

  /**
   * Fetches comments for the current file using the comment provider
   * and displays them in the gutter
   * @method _fetchAndShowComments
   */
  async _fetchAndShowComments(isForceFetch) {
    const editor = this._getEditor()
    if (!editor) return // ensure we have an actual editor
    const filePath = editor.isEmpty() ? null : editor.getPath()
    const comments = await this.commentProvider.fetchComments(filePath, isForceFetch)

    this.fetchedComments = comments
    this._resetView()

    for (let comment of comments) {
      this._renderComments(comment)
    }
  }

  getElement() {
    return this.element;
  }

}
