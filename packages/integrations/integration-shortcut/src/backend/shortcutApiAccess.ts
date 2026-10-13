import type { AuthCredentials } from '@viberglass/types'

const SHORTCUT_API = 'https://api.app.shortcut.com/api/v3'

export type ShortcutConfig = Pick<AuthCredentials, 'apiKey' | 'token'> & { baseUrl?: unknown }

export interface ShortcutApiAccess {
  base: string
  token: string
}

/** The API address and token a connection talks to Shortcut with. */
export function shortcutApiAccess(config: ShortcutConfig): ShortcutApiAccess {
  const token = config.apiKey || config.token
  if (!token) throw new Error('The Shortcut connection has no API token')
  const base = typeof config.baseUrl === 'string' && config.baseUrl ? config.baseUrl.replace(/\/+$/, '') : SHORTCUT_API
  return { base, token }
}
