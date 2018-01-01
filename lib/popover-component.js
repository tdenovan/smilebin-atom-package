const etch = require('etch')
const $ = etch.dom
const SignInComponent = require('./sign-in-component')
const UserInfoComponent = require('./user-info-component')

module.exports =
class PopoverComponent {
  constructor (props) {
    this.props = props
    if (this.props.authenticationProvider) {
      this.props.authenticationProvider.onDidChange(() => { this.update() })
    }
    etch.initialize(this)
  }

  update () {
    return etch.update(this)
  }

  render () {
    const {
      isClientOutdated, initializationError,
      authenticationProvider,
      commandRegistry, clipboard, workspace, notificationManager
    } = this.props

    let activeComponent
    if (isClientOutdated) {
      activeComponent = $(PackageOutdatedComponent, {
        ref: 'packageOutdatedComponent',
        workspace
      })
    } else if (initializationError) {
      activeComponent = $(PackageInitializationErrorComponent, {
        ref: 'packageInitializationErrorComponent'
      })
    } else if (this.props.authenticationProvider.isSignedIn()) {
      activeComponent = $(UserInfoComponent, {
        ref: 'userInfoComponent',
        localUserIdentity: authenticationProvider.getIdentity(),
        clipboard,
        commandRegistry,
        notificationManager
      })
    } else {
      activeComponent = $(SignInComponent, {
        ref: 'signInComponent',
        authenticationProvider,
        commandRegistry
      })
    }

    return $.div({className: 'SmilebinPopoverComponent'}, activeComponent)
  }
}
