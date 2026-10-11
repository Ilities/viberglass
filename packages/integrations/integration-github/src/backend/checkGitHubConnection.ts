import type { AuthCredentials } from '@viberglass/types'

/** Reads the token's own user, which any working token can. */
export async function checkGitHubConnection(config: AuthCredentials): Promise<void> {
  const response = await fetch(`${config.baseUrl || 'https://api.github.com'}/user`, {
    headers: { Authorization: `token ${config.token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'viberglass' },
  }).catch((error: unknown) => {
    throw new Error(`GitHub authentication failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (!response.ok) throw new Error(`GitHub authentication failed: HTTP ${response.status}`)
}
