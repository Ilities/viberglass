import type { AuthCredentials } from '@viberglass/types'
import { ASANA_API, asanaHeaders, asanaToken } from './asanaApi'

/** Reads the member the personal access token belongs to. */
export async function checkAsanaConnection(config: AuthCredentials): Promise<void> {
  const token = asanaToken(config)
  const response = await fetch(`${ASANA_API}/users/me`, { headers: asanaHeaders(token) }).catch((error: unknown) => {
    throw new Error(`Asana couldn't be reached: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Asana rejected the personal access token: HTTP ${response.status}`)
  }
  if (!response.ok) throw new Error(`Asana authentication failed: HTTP ${response.status}`)
}
