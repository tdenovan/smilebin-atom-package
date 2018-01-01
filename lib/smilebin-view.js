'use babel';

const { CompositeDisposable, Point } = require('atom')

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

    this._setupSubscriptions()
    this._fetchAndShowComments()
  }

  // Tear down any state and detach
  destroy() {
    this.subscriptions.dispose()
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

    this.markers.push(decoration)
  }

  /**
   * Fetches comments for the current file using the comment provider
   * and displays them in the gutter
   * @method _fetchAndShowComments
   */
  async _fetchAndShowComments() {
    this._resetView()

    const editor = this._getEditor()
    if (!editor) return // ensure we have an actual editor
    const filePath = editor.isEmpty() ? null : editor.getPath()
    const comments = await this.commentProvider.fetchComments(filePath)

    for (let comment of comments) {
      this._renderComments(comment)
    }
  }

  getElement() {
    return this.element;
  }

}
