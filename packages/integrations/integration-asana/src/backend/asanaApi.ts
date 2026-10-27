export const ASANA_API = 'https://app.asana.com/api/1.0'

/** The personal access token a connection talks to Asana with. */
export function asanaToken(config: { apiKey?: string; token?: string }): string {
  const token = config.token || config.apiKey
  if (!token) throw new Error('The Asana connection has no personal access token')
  return token
}

export function asanaHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'viberglass' }
}
