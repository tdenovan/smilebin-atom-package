'use babel';

import SmilebinAtomView from './smilebin-view'
import { CompositeDisposable } from 'atom'
import StatusBarIndicator from './status-bar-indicator'
import AuthenticationProvider from './authentication-provider'
import CommentProvider from './comment-provider'
import CredentialCache from './credential-cache'
import { ApolloClient } from 'apollo-client'
import { HttpLink } from 'apollo-link-http'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { ApolloProvider } from 'react-apollo'
import { authLink } from './apollo-auth'

const BACKEND_URL = 'http://localhost:8080'

export default class Smilebin {

  constructor(options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      credentialCache, pubSubGateway, pusherKey, pusherOptions, baseURL, tetherDisconnectWindow
    } = options

    this.options = options
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.credentialCache = credentialCache || new CredentialCache()
    this.commandRegistry = commandRegistry
    this.tooltipManager = tooltipManager
    this.clipboard = clipboard
    this.smilebinAtomView = null
    this.modalPanel = null
    this.subscriptions = null
    this.apolloClient = new ApolloClient({
      cache: new InMemoryCache(),
      // authlink injects the authorization header
      link: authLink(this.credentialCache).concat(new HttpLink({ uri: BACKEND_URL + '/graphql' }))
    })

    const authenticationProvider = this.getAuthenticationProvider()
    this.commentProvider = new CommentProvider({
      apolloClient: this.apolloClient,
      notificationManager,
      workspace,
      authenticationProvider
    })
  }

  async activate(state) {
    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(this.commandRegistry.add('atom-workspace', {
      'smilebin:toggle': () => this.toggle()
    }))
    this.subscriptions.add(this.commandRegistry.add('atom-workspace.smilebin-Authenticated', {
      'smilebin:sign-out': () => this.signOut()
    }))
    this.subscriptions.add(this.commandRegistry.add('atom-workspace.smilebin-Authenticated', {
      'smilebin:smile': () => this.toggleSmiley()
    }))

    // Initiate sign-in, which will continue asynchronously, since we don't want
    // to block here.
    await this.signInUsingSavedToken()

    // On by default
    this.toggle()
  }

  deactivate() {
    this.subscriptions.dispose();
    this.smilebinAtomView.destroy();
  }

  toggle() {
    if (this.smilebinAtomView) {
      this.smilebinAtomView.destroy()
      this.smilebinAtomView = null
    } else {
      this.smilebinAtomView = new SmilebinAtomView({
        commentProvider: this.commentProvider,
        apolloClient: this.apolloClient,
        workspace: this.workspace,
        notificationManager: this.notificationManager
      })
    }
  }

  /**
   * Comments a line of code with a smiley face
   * If there is already one there then it removes it
   * @method comment
   */
  toggleSmiley() {
    if (!this.smilebinAtomView) return
    this.smilebinAtomView.toggleSmiley()
  }

  getAuthenticationProvider () {
    if (this.authenticationProvider) return this.authenticationProvider

    this.authenticationProvider = new AuthenticationProvider({
      credentialCache: this.credentialCache,
      notificationManager: this.notificationManager,
      workspace: this.workspace,
      apolloClient: this.apolloClient
    })

    return this.authenticationProvider
  }

  async signInUsingSavedToken () {
    const authenticationProvider = this.getAuthenticationProvider()
    if (authenticationProvider) {
      return authenticationProvider.signInUsingSavedToken()
    } else {
      return false
    }
  }

  async signOut () {
    const authenticationProvider = this.getAuthenticationProvider()
    if (authenticationProvider) {
      this.statusBarIndicator.showPopover()
      await authenticationProvider.signOut()
    }
  }

  async consumeStatusBar (statusBar) {
    const authenticationProvider = this.getAuthenticationProvider()
    this.statusBarIndicator = new StatusBarIndicator({
      ...this.options,
      statusBar,
      authenticationProvider
    })

    this.statusBarIndicator.attach()
  }

}
