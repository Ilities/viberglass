import type { AuthCredentials } from '@viberglass/types'

export const ASANA_API = 'https://app.asana.com/api/1.0'

export type AsanaConfig = AuthCredentials

export function asanaToken(config: AsanaConfig): string {
  const token = config.apiKey || config.token
  if (!token) throw new Error('The Asana connection has no personal access token')
  return token
}

export async function asanaRequest(
  config: AsanaConfig,
  path: string,
  fetchImpl: typeof fetch = fetch,
  init: RequestInit = {},
): Promise<{ data: object }> {
  const response = await fetchImpl(`${ASANA_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${asanaToken(config)}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  }).catch((error: unknown) => {
    throw new Error(`Asana API request failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`Asana API request failed: HTTP ${response.status}${message ? `: ${message}` : ''}`)
  }
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null || !('data' in body) || typeof body.data !== 'object' || body.data === null) {
    throw new Error('Asana API returned an unexpected response')
  }
  const data: object = body.data
  return { data }
}
