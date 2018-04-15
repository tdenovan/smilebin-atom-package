const etch = require('etch')
const $ = etch.dom

module.exports =
class UserInfoComponent {
  constructor(props) {
    this.props = props
    etch.initialize(this)
  }

  update(props) {
    Object.assign(this.props, props)
    return etch.update(this)
  }

  render() {
    const { localUserIdentity: currentUser } = this.props
    return $.div({className: 'UserInfoComponent'},
      $.h3(null, `Welcome ${currentUser.email}`),
      $.p(null, 'You are signed in to Smilebin')
    )
  }
}
