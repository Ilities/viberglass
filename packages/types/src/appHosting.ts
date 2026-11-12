import type { AppPreviewState } from './appPreview'
import type { AppRelease } from './appRelease'

/** Whether the space's maintainers want the app running. */
export type AppPower = 'on' | 'off'

/** What the app is doing now. `failed` means it should be on but isn't serving. */
export type AppRunState = 'off' | 'starting' | 'running' | 'stopping' | 'failed'

/** A release as the App page lists it; its build log is fetched when someone opens it. */
export type AppReleaseView = Omit<AppRelease, 'buildLog'>

/** A task's change running in a preview, as the App page lists it. */
export interface AppPreviewEntry {
  id: string
  taskId: string
  state: AppPreviewState
  statusMessage: string | null
}

export interface AppView {
  power: AppPower
  state: AppRunState
  /** Why the app isn't serving, or why the newest release didn't go live. */
  statusMessage: string | null
  currentRelease: AppReleaseView | null
  /** Newest first. */
  releases: AppReleaseView[]
  /** The tasks its releases and previews came from, by id. */
  tasks: Record<string, { key: string; title: string }>
  /** Changes in a preview that isn't switched off, newest first. */
  previews: AppPreviewEntry[]
  /** For each release that can be rolled back to with its data, when that data is from. */
  dataPoints: Record<string, string>
  /** A rollback asked for that hasn't happened yet. */
  rollback: { releaseId: string; withData: boolean } | null
  /** A maintainer asked for a backup that hasn't been taken yet. */
  backupDue: boolean
  /** A scheduled restore of the data that hasn't happened yet. */
  dataRestoreDue: boolean
  /** Where people open the app; null when apps aren't served on this workspace. */
  url: string | null
}

/** Why a copy of an app's data was taken: before a release or rollback switched, on archive or eject, or by hand. */
export type AppDataBackupReason = 'release' | 'rollback' | 'archive' | 'eject' | 'manual'

/** A kept copy of an app's data, which a schedule can put back. */
export interface AppDataBackup {
  id: string
  reason: AppDataBackupReason
  takenAt: string
  /** The release that was serving this data; null when none was. */
  fromRelease: { id: string; commitSha: string } | null
  bytes: number
}

/** Making an earlier release (or one set aside by a rollback) the live one again. */
export interface AppRollbackRequest {
  /** Also restore the data as that release left it, losing what changed since. */
  withData: boolean
}

/**
 * Opening an app: either the address that signs the person in to it, or who
 * can turn it on when it's off. A preview that's off is turned on from its task.
 */
export type AppHandoff =
  | { status: 'ready'; url: string }
  | { status: 'off'; appName: string; maintainers: string[] }
  | { status: 'preview_off'; taskKey: string; taskPath: string }

/** Where apps run; the same targets agent runs use. */
export type AppHostTarget = 'docker' | 'ecs' | 'kubernetes'

/** The live app's instance; Docker names it viberglass-app-{projectId}. */
export function liveAppInstance(projectId: string): string {
  return `app-${projectId}`
}

/** One preview's instance, separate from the live app's. */
export function previewInstance(previewId: string): string {
  return `preview-${previewId}`
}

export function isPreviewInstance(instance: string): boolean {
  return instance.startsWith('preview-')
}

/** One release of one app, ready to be run by an `AppHost` as `instance`. */
export interface AppInstanceSpec {
  instance: string
  projectId: string
  image: string
  /** What the runtime image needs: the bundle, the data replica and its credentials, and the app's settings. */
  env: Record<string, string>
  /** Secret settings the host fetches itself, so their values never appear in what it registers; only ECS uses these. */
  secretRefs?: AppSecretRef[]
}

/** A secret setting as an environment variable read from an SSM parameter when the instance starts. */
export interface AppSecretRef {
  name: string
  ssmParameter: string
}

export interface AppInstanceStatus {
  /** `starting`: started, but not running yet, such as while its image is pulled. */
  state: 'missing' | 'starting' | 'running' | 'stopped' | 'restarting'
  detail?: string
}

/**
 * Runs apps on one target: the live app and its previews are separate
 * instances, named by `liveAppInstance` and `previewInstance`. An instance's
 * data volume outlives it: replacing it with another release keeps the data.
 */
export interface AppHost {
  readonly target: AppHostTarget
  /** Replaces the app's instance with one for this spec, without starting it. */
  create(spec: AppInstanceSpec): Promise<void>
  start(instance: string): Promise<void>
  /** Gives the app, and Litestream's last sync, up to `graceSeconds` before it's killed. */
  stop(instance: string, graceSeconds: number): Promise<void>
  status(instance: string): Promise<AppInstanceStatus>
  /** The base URL the platform reaches the app at, such as http://viberglass-app-x:3000. */
  address(instance: string): string
  logs(instance: string, tailLines: number): Promise<string>
  /** Drops the instance's local data, so its next start restores it from the replica. */
  clearData(instance: string): Promise<void>
  /** Removes the instance, its local data and its network. */
  delete(instance: string): Promise<void>
  /**
   * Makes sure the platform and object storage still reach the apps and
   * previews of these App spaces, after either was replaced. Other spaces'
   * instances may belong to another installation on the same host.
   */
  rejoinPlatform(projectIds: string[]): Promise<void>
  /** Removes what a deleted App space kept on the host besides its instances, such as its roles. */
  forgetSpace(projectId: string): Promise<void>
}

/** The app's live replica, which only the app itself writes. */
export function appDataPath(projectId: string): string {
  return `spaces/${projectId}/app-data`
}

/** Outside the replica's prefix, so the app's credentials can't touch it. */
export function appBackupsPath(projectId: string): string {
  return `spaces/${projectId}/backups`
}

export function appBackupPath(projectId: string, backupId: string): string {
  return `${appBackupsPath(projectId)}/${backupId}`
}

/** The last copy of an ejected app's database, as one SQLite file to download. */
export function ejectedAppDataPath(projectId: string): string {
  return `spaces/${projectId}/ejected`
}

export function ejectedAppDataKey(projectId: string, backupId: string): string {
  return `${ejectedAppDataPath(projectId)}/${backupId}/app.db`
}

/** A copy of the app's database made for one agent turn; outside the replica, like backups. */
export function appDataGrantKey(projectId: string, grantId: string): string {
  return `spaces/${projectId}/data-grants/${grantId}/app.db`
}
