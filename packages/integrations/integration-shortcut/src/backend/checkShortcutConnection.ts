import type { AuthCredentials } from '@viberglass/types'

/** Reads the member the API token belongs to. */
export async function checkShortcutConnection(config: AuthCredentials): Promise<void> {
  const response = await fetch(`${config.baseUrl || 'https://api.app.shortcut.com/api/v3'}/member`, {
    headers: { 'Shortcut-Token': config.apiKey || config.token || '', 'User-Agent': 'viberglass' },
  }).catch((error: unknown) => {
    throw new Error(`Shortcut authentication failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (!response.ok) throw new Error(`Shortcut authentication failed: HTTP ${response.status}`)
}
