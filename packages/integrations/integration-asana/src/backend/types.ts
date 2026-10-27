import type { AuthCredentials } from '@viberglass/types'

export interface AsanaConfig extends AuthCredentials {
  /** Asana's API, overridden only for a test or a proxy. */
  baseUrl?: string
}
