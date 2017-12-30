'use babel';

import SmilebinAtomView from './smilebin-view';
import { CompositeDisposable } from 'atom';
import StatusBarIndicator from './status-bar-indicator'

export default class Smilebin {

  constructor(options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      credentialCache, pubSubGateway, pusherKey, pusherOptions, baseURL, tetherDisconnectWindow
    } = options

    this.options = options
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.commandRegistry = commandRegistry
    this.tooltipManager = tooltipManager
    this.clipboard = clipboard
    this.smilebinAtomView = null
    this.modalPanel = null
    this.subscriptions = null
  }

  activate(state) {
    this.smilebinAtomView = new SmilebinAtomView(state.smilebinAtomViewState);
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.smilebinAtomView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(this.commandRegistry.add('atom-workspace', {
      'smilebin:toggle': () => this.toggle()
    }));
  }

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.smilebinAtomView.destroy();
  }

  serialize() {
    return {
      smilebinAtomViewState: this.smilebinAtomView.serialize()
    };
  }

  toggle() {
    console.log('SmilebinAtom was toggled!');
    return (
      this.modalPanel.isVisible() ?
      this.modalPanel.hide() :
      this.modalPanel.show()
    );
  }

  async consumeStatusBar (statusBar) {
    this.statusBarIndicator = new StatusBarIndicator({
      ...this.options,
      statusBar
    })

    this.statusBarIndicator.attach()
  }

}
