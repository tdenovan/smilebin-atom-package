const {Emitter} = require('atom')

module.exports =
class AuthenticationProvider {
  constructor ({notificationManager, workspace, credentialCache}) {
    this.credentialCache = credentialCache
    this.notificationManager = notificationManager
    this.workspace = workspace
    this.emitter = new Emitter()
  }

  async signInUsingSavedToken () {
    if (this.isSignedIn()) return true

    const token = await this.credentialCache.get('oauth-token')
    if (token) {
      return this._signIn(token)
    } else {
      return false
    }
  }

  async signIn (token) {
    if (this.isSignedIn()) return true

    if (await this._signIn(token)) {
      await this.credentialCache.set('oauth-token', token)
      return true
    } else {
      return false
    }
  }

  async signOut () {
    if (!this.isSignedIn()) return

    await this.credentialCache.delete('oauth-token')
    this.client.signOut()
  }

  async _signIn (token) {
    try {
      this.signingIn = true
      this.didChangeSignIn()

      const signedIn = await this.client.signIn(token)
      return signedIn
    } catch (error) {
      this.notificationManager.addError('Failed to authenticate to smilebin', {
        description: `Signing in failed with error: <code>${error.message}</code>`,
        dismissable: true
      })
    } finally {
      this.signingIn = false
      this.didChangeSignIn()
    }
  }

  isSigningIn () {
    return this.signingIn
  }

  isSignedIn () {
    return false // TODO fix it
  }

  getIdentity () {
    return this.client.getLocalUserIdentity()
  }

  onDidChange (callback) {
    return this.emitter.on('did-change', callback)
  }

  didChangeSignIn () {
    const workspaceElement = this.workspace.getElement()
    if (this.isSignedIn()) {
      workspaceElement.classList.add('smilebin-Authenticated')
    } else {
      workspaceElement.classList.remove('smilebin-Authenticated')
    }

    this.emitter.emit('did-change')
  }
}
