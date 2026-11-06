import type { AuthCredentials } from '@viberglass/types'
import { asanaApiAccess } from './asanaApiAccess'

/** Reads the user the personal access token belongs to. */
export async function checkAsanaConnection(config: AuthCredentials): Promise<void> {
  const { base, token } = asanaApiAccess(config)
  const response = await fetch(`${base}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch((error: unknown) => {
    throw new Error(`Asana authentication failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (!response.ok) throw new Error(`Asana authentication failed: HTTP ${response.status}`)
}
