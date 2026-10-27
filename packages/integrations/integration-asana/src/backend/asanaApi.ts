import type { AsanaConfig } from './types'

const ASANA_API = 'https://app.asana.com/api/1.0'

export interface AsanaApiAccess {
  base: string
  token: string
}

/** The API address and personal access token a connection talks to Asana with. */
export function asanaApiAccess(config: Pick<AsanaConfig, 'token' | 'apiKey' | 'baseUrl'>): AsanaApiAccess {
  const token = config.token || config.apiKey
  if (!token) throw new Error('The Asana connection has no personal access token')
  const base = typeof config.baseUrl === 'string' && config.baseUrl ? config.baseUrl.replace(/\/+$/, '') : ASANA_API
  return { base, token }
}

export type Fetch = typeof fetch

/** Reads one Asana object, returning its `data`; throws Asana's own message when it refuses. */
export async function asanaGet(
  access: AsanaApiAccess,
  path: string,
  optFields: string,
  fetchImpl: Fetch = fetch,
): Promise<Record<string, unknown>> {
  const url = new URL(`${access.base}${path}`)
  url.searchParams.set('opt_fields', optFields)
  const response = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${access.token}`, Accept: 'application/json', 'User-Agent': 'viberglass' },
  })
  if (!response.ok) throw new Error(await asanaError(response, path))
  const body: unknown = await response.json().catch(() => null)
  const data = isRecord(body) ? body.data : undefined
  if (!isRecord(data)) throw new Error(`Asana returned no ${path} record`)
  return data
}

/** Asana's error message, which names the field or permission that went wrong. */
export async function asanaError(response: Response, subject: string): Promise<string> {
  const body: unknown = typeof response.json === 'function' ? await response.json().catch(() => null) : null
  const errors = isRecord(body) && Array.isArray(body.errors) ? body.errors : []
  const messages = errors.flatMap((error) => (isRecord(error) && typeof error.message === 'string' ? [error.message] : []))
  const detail = messages.length > 0 ? messages.join('; ') : response.statusText || 'no message'
  return `Asana refused ${subject}: HTTP ${response.status} ${detail}`.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
