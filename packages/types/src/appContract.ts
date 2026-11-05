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

export const APP_SETTING_NAME_MAX_LENGTH = 100

/** What an SSM parameter holds, where secret settings are kept on AWS. */
export const APP_SETTING_VALUE_MAX_BYTES = 3900

const RESERVED_SETTING_NAMES = new Set(['PORT', 'HOME', 'PATH', 'NODE_OPTIONS', 'APP_DATABASE_PATH'])
const RESERVED_SETTING_PREFIXES = ['VIBERGLASS_', 'AWS_', 'LITESTREAM_']

/** Names the runtime sets itself, so a setting can't take them. */
export function isReservedAppSettingName(name: string): boolean {
  return RESERVED_SETTING_NAMES.has(name) || RESERVED_SETTING_PREFIXES.some((prefix) => name.startsWith(prefix))
}

/** Why a setting can't have this name, or null when it can. */
export function appSettingNameProblem(name: string): string | null {
  if (!APP_SETTING_NAME_PATTERN.test(name) || name.length > APP_SETTING_NAME_MAX_LENGTH) {
    return `A setting's name uses upper-case letters, digits and underscores, starts with a letter and has at most ${APP_SETTING_NAME_MAX_LENGTH} characters, such as SLACK_WEBHOOK_URL.`
  }
  if (isReservedAppSettingName(name)) {
    return `${name} is set by Viberglass itself. PORT, HOME, PATH, NODE_OPTIONS, APP_DATABASE_PATH and names starting with VIBERGLASS_, AWS_ or LITESTREAM_ can't be settings.`
  }
  return null
}

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
  const settings = parseAppManifestSettings(record.settings ?? [])
  if ('error' in settings) return settings
  return { manifest: { build, start, settings: settings.settings } }
}

/** The manifest's `settings` list, as the build checks it and the release reports it. */
export function parseAppManifestSettings(settings: unknown): { settings: AppManifestSetting[] } | { error: string } {
  if (!Array.isArray(settings)) return { error: `"settings" in ${APP_MANIFEST_FILE} must be a list` }
  const parsed: AppManifestSetting[] = []
  for (const setting of settings) {
    const entry: Record<string, unknown> = typeof setting === 'object' && setting !== null ? { ...setting } : {}
    if (typeof entry.name !== 'string' || !APP_SETTING_NAME_PATTERN.test(entry.name)) {
      return { error: `Each setting in ${APP_MANIFEST_FILE} needs a name such as SLACK_WEBHOOK_URL` }
    }
    const problem = appSettingNameProblem(entry.name)
    if (problem) return { error: `${APP_MANIFEST_FILE}: ${problem}` }
    parsed.push({
      name: entry.name,
      secret: entry.secret === true,
      ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
    })
  }
  return { settings: parsed }
}
