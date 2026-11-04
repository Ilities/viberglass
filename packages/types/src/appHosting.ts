import type { AppRelease } from './appRelease'

/** Whether the space's maintainers want the app running. */
export type AppPower = 'on' | 'off'

/** What the app is doing now. `failed` means it should be on but isn't serving. */
export type AppRunState = 'off' | 'starting' | 'running' | 'stopping' | 'failed'

export interface AppView {
  power: AppPower
  state: AppRunState
  /** Why the app isn't serving, or why the newest release didn't go live. */
  statusMessage: string | null
  currentRelease: AppRelease | null
  /** Newest first. */
  releases: AppRelease[]
  /** For each release that can be rolled back to with its data, when that data is from. */
  dataPoints: Record<string, string>
  /** A rollback asked for that hasn't happened yet. */
  rollback: { releaseId: string; withData: boolean } | null
  /** Where people open the app; null when apps aren't served on this workspace. */
  url: string | null
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
  /** What the runtime image needs: the bundle, the data replica and its credentials. */
  env: Record<string, string>
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
}

/** The app's live replica, which only the app itself writes. */
export function appDataPath(projectId: string): string {
  return `spaces/${projectId}/app-data`
}

/** Outside the replica's prefix, so the app's credentials can't touch it. */
export function appBackupPath(projectId: string, backupId: string): string {
  return `spaces/${projectId}/backups/${backupId}`
}
