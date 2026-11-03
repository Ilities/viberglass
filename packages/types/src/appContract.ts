/**
 * The contract an App space's app follows so Viberglass can build, run and
 * sign people into it.
 */

/** At the repository root. */
export const APP_MANIFEST_FILE = 'viberglass.app.json'

/** The app's only persistent state; nothing else on disk survives a restart. */
export const APP_DATABASE_PATH = '/data/app.db'

export const APP_HEALTH_PATH = '/healthz'

/** Set by the gateway on every request it passes on; the app never sees a request without them. */
export const APP_USER_HEADERS = {
  id: 'X-Viberglass-User-Id',
  email: 'X-Viberglass-User-Email',
  name: 'X-Viberglass-User-Name',
} as const

/** Upper-case letters, digits and underscores, starting with a letter. */
export const APP_SETTING_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

export interface AppManifestSetting {
  /** The environment variable the app reads, e.g. SLACK_WEBHOOK_URL. */
  name: string
  secret: boolean
  description?: string
}

/** `viberglass.app.json`. */
export interface AppManifest {
  /** Run in the repository root to produce what `start` runs. */
  build: string
  start: string
  settings: AppManifestSetting[]
}
