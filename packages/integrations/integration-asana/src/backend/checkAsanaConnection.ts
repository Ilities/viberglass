import type { AuthCredentials } from '@viberglass/types'
import { asanaRequest } from './asanaApi'

/** Confirms the token can authenticate against Asana's user endpoint. */
export async function checkAsanaConnection(config: AuthCredentials): Promise<void> {
  const response = await asanaRequest(config, '/users/me?opt_fields=gid,name').catch((error: unknown) => {
    const message = error instanceof Error ? error.message.replace(/^Asana API request failed: /, '') : String(error)
    throw new Error(`Asana authentication failed: ${message}`)
  })
  const data = response.data
  if (!('gid' in data) || !('name' in data)) throw new Error('Asana authentication failed: unexpected user response')
}
