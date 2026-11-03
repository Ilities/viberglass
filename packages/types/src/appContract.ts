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

/** The manifest, or what's wrong with it in a sentence the build log can show. */
export function parseAppManifest(value: unknown): { manifest: AppManifest } | { error: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { error: `${APP_MANIFEST_FILE} must be a JSON object` }
  const record: Record<string, unknown> = { ...value }
  const { build, start } = record
  if (typeof build !== 'string' || !build.trim()) return { error: `${APP_MANIFEST_FILE} needs a "build" command` }
  if (typeof start !== 'string' || !start.trim()) return { error: `${APP_MANIFEST_FILE} needs a "start" command` }
  const settings = record.settings ?? []
  if (!Array.isArray(settings)) return { error: `"settings" in ${APP_MANIFEST_FILE} must be a list` }
  const parsed: AppManifestSetting[] = []
  for (const setting of settings) {
    const entry: Record<string, unknown> = typeof setting === 'object' && setting !== null ? { ...setting } : {}
    if (typeof entry.name !== 'string' || !APP_SETTING_NAME_PATTERN.test(entry.name)) {
      return { error: `Each setting in ${APP_MANIFEST_FILE} needs a name such as SLACK_WEBHOOK_URL` }
    }
    parsed.push({
      name: entry.name,
      secret: entry.secret === true,
      ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
    })
  }
  return { manifest: { build, start, settings: parsed } }
}
