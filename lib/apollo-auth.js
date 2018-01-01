'use babel';

import { setContext } from 'apollo-link-context'

export const authLink = (credentialCache) => (
  setContext(async (request, { headers }) => {
    // get the authentication token from local storage if it exists
    let token = await credentialCache.get('token')

    if (token) {
      headers = {...headers} // eslint-disable-line
      headers['Authorization'] = `Bearer ${token}`
    }

    // return the headers to the context so httpLink can read them
    return {
      headers
    }
  })
)
