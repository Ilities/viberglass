import type { AuthCredentials } from '@viberglass/types'
import { asanaApiAccess, asanaError } from './asanaApi'
import type { AsanaConfig } from './types'

/** Reads the account the personal access token belongs to. */
export async function checkAsanaConnection(config: AuthCredentials & AsanaConfig): Promise<void> {
  const access = asanaApiAccess(config)
  const response = await fetch(`${access.base}/users/me?opt_fields=name,email`, {
    headers: { Authorization: `Bearer ${access.token}`, Accept: 'application/json', 'User-Agent': 'viberglass' },
  }).catch((error: unknown) => {
    throw new Error(`Asana authentication failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (!response.ok) {
    const detail = await asanaError(response, 'the personal access token')
    throw new Error(`Asana authentication failed: ${detail}`)
  }
}
