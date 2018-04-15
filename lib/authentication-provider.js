const {Emitter} = require('atom')
const gql = require('graphql-tag')

module.exports =
class AuthenticationProvider {
  constructor({notificationManager, workspace, credentialCache, apolloClient}) {
    this.credentialCache = credentialCache
    this.apolloClient = apolloClient
    this.notificationManager = notificationManager
    this.workspace = workspace
    this.emitter = new Emitter()
    this.currentUser = null
  }

  async signInUsingSavedToken() {
    if (this.isSignedIn()) return true

    const token = await this.credentialCache.get('token')
    if (token) {
      return this._signIn(token)
    }
    return false

  }

  async signIn(token) {
    if (this.isSignedIn()) return true

    if (await this._signIn(token)) {
      await this.credentialCache.set('token', token)
      return true
    }
    return false

  }

  async signOut() {
    if (!this.isSignedIn()) return

    await this.credentialCache.delete('token')
  }

  async _signIn(token) {
    try {
      this.signingIn = true
      this.didChangeSignIn()

      const result = await this.apolloClient.query({ query: gql`
        {
          currentAppUser {
            id
            firstName
            lastName
            email
          }
        }`,
        // Manually specify the auth header because we don't save the token
        // (for apollo-auth) to use until we know it is valid
      context: { headers: { Authorization: `Bearer ${token}` } }
      })
      const currentUser = result.data.currentAppUser
      this.currentUser = currentUser
      return currentUser
    } catch (error) {
      // this.notificationManager.addError('Failed to authenticate to smilebin', {
      //   description: `Signing in failed with error: <code>${error.message}</code>`,
      //   dismissable: true
      // })
      console.error(`Error signing in to smilebin ${error.message}`)
    } finally {
      this.signingIn = false
      this.didChangeSignIn()
    }
  }

  isSigningIn() {
    return this.signingIn
  }

  isSignedIn() {
    return Boolean(this.currentUser)
  }

  getIdentity() {
    return this.currentUser
  }

  onDidChange(callback) {
    return this.emitter.on('did-change', callback)
  }

  didChangeSignIn() {
    const workspaceElement = this.workspace.getElement()
    if (this.isSignedIn()) {
      workspaceElement.classList.add('smilebin-Authenticated')
    } else {
      workspaceElement.classList.remove('smilebin-Authenticated')
    }

    this.emitter.emit('did-change')
  }
}
