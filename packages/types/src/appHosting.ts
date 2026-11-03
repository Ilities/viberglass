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
}

/** Where apps run; the same targets agent runs use. */
export type AppHostTarget = 'docker' | 'ecs' | 'kubernetes'

/** One release of one app, ready to be run by an `AppHost`. */
export interface AppInstanceSpec {
  projectId: string
  image: string
  /** What the runtime image needs: the bundle, the data replica and its credentials. */
  env: Record<string, string>
}

export interface AppInstanceStatus {
  state: 'missing' | 'running' | 'stopped' | 'restarting'
  detail?: string
}

/**
 * Runs apps on one target, one instance per app. The app's data volume
 * outlives its instance: replacing the instance with another release keeps it.
 */
export interface AppHost {
  readonly target: AppHostTarget
  /** Replaces the app's instance with one for this spec, without starting it. */
  create(spec: AppInstanceSpec): Promise<void>
  start(projectId: string): Promise<void>
  /** Gives the app, and Litestream's last sync, up to `graceSeconds` before it's killed. */
  stop(projectId: string, graceSeconds: number): Promise<void>
  status(projectId: string): Promise<AppInstanceStatus>
  /** The base URL the platform reaches the app at, such as http://viberglass-app-x:3000. */
  address(projectId: string): string
  logs(projectId: string, tailLines: number): Promise<string>
  /** Drops the app's local data, so its next start restores it from the replica. */
  clearData(projectId: string): Promise<void>
  /** Removes the instance, its local data and its network. */
  delete(projectId: string): Promise<void>
}

/** The app's live replica, which only the app itself writes. */
export function appDataPath(projectId: string): string {
  return `spaces/${projectId}/app-data`
}

/** Outside the replica's prefix, so the app's credentials can't touch it. */
export function appBackupPath(projectId: string, backupId: string): string {
  return `spaces/${projectId}/backups/${backupId}`
}
