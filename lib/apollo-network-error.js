/**
 * This class manages network errors from apollo
 * @type {[type]}
 */

const RETRY_INTERVAL_SECONDS = 180

module.exports =
class ApolloNetworkErrorManager {

  constructor() {
    // if there is an error this variable stores when we can next retry
    this.nextRetryAt = null

    // Bind to preserve this
    this.onError = this.onError.bind(this)
  }

  hasError() {
    if (!this.nextRetryAt) return false

    const currentDate = new Date()
    if (currentDate > this.nextRetryAt) return false

    return true
  }

  onError({ networkError }) {
    // if (graphQLErrors)
    //   graphQLErrors.map(({ message, locations, path }) =>
    //     console.log(
    //       `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`,
    //     ),
    //   )
    if (networkError) {
      // delay further network requests until we hit the retry interval
      this.nextRetryAt = new Date()
      this.nextRetryAt.setSeconds(this.nextRetryAt.getSeconds() + RETRY_INTERVAL_SECONDS)
    }
  }

}
