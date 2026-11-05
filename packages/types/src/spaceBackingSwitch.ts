/** What a space brought in as an app starts with: no data, the copy kept when its app was ejected, or an uploaded SQLite file. */
export const APP_START_FROM = ['none', 'last_copy', 'upload'] as const

export type AppStartFrom = (typeof APP_START_FROM)[number]

export function isAppStartFrom(value: unknown): value is AppStartFrom {
  return typeof value === 'string' && (APP_START_FROM as readonly string[]).includes(value)
}

/** The largest SQLite file someone can upload as an app's starting data. */
export const APP_DATA_UPLOAD_MAX_BYTES = 512 * 1024 * 1024

/** The last copy of an ejected app's data, kept for a while to download or to bring back in. */
export interface EjectedAppData {
  ejectedAt: string
  /** Size of the SQLite file to download; null when the app had no data. */
  bytes: number | null
  /** When the copy, the app's backups and its releases are removed. */
  keptUntil: string
}

/** What a space's settings need to offer switching between git and App. */
export interface SpaceBackingOptions {
  /** Whether this workspace can host apps at all. */
  appSpacesAvailable: boolean
  /** Whether the space's name works as an app's address; when it doesn't, bringing in needs a new name. */
  nameFitsApp: boolean
  /** Rule an app's name follows, shown next to the rename field. */
  appNameRule: string
  ejected: EjectedAppData | null
  /** How long an ejected app's last copy of its data is kept. */
  keepDays: number
}

export interface SpaceBroughtIn {
  /** The space's slug, new when it was renamed. */
  slug: string
  /** The task asking the agent to make the repository follow the app contract, when it didn't yet. */
  contractTaskId: string | null
  /** What couldn't be done; the space is an App space anyway. */
  warnings: string[]
}
