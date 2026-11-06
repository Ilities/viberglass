import type { AuthCredentials } from '@viberglass/types'

const ASANA_API = 'https://app.asana.com/api/1.0'

export interface AsanaApiAccess {
  base: string
  token: string
}

/** The API address and personal access token a connection talks to Asana with. */
export function asanaApiAccess(config: AuthCredentials): AsanaApiAccess {
  const token = config.token || config.apiKey
  if (!token) throw new Error('The Asana connection has no personal access token')
  const base = typeof config.baseUrl === 'string' && config.baseUrl ? config.baseUrl.replace(/\/+$/, '') : ASANA_API
  return { base, token }
}
