import type { AppManifestSetting } from './appContract'

/** A release is built once per commit of an App space's default branch. */
export type AppReleaseStatus = 'building' | 'ready' | 'failed'

export interface AppRelease {
  id: string
  projectId: string
  commitSha: string
  status: AppReleaseStatus
  jobId: string | null
  /** Set once the bundle is uploaded. */
  bundleSha256: string | null
  bundleBytes: number | null
  /** The Node version the bundle was built with, such as v24.11.0. */
  nodeVersion: string | null
  buildLog: string | null
  failureReason: string | null
  /** When it became the app's current release. */
  wentLiveAt: string | null
  /** Why it didn't, such as a failed health check; it isn't tried again. */
  liveFailure: string | null
  /** The task whose change was made live into this release. */
  ticketId: string | null
  /** When a rollback to an older release set it aside; it doesn't go live by itself after that. */
  rolledBackAt: string | null
  /** Its bundle was removed to save space, so it can't be made live again. */
  bundleRemoved: boolean
  createdAt: string
  finishedAt: string | null
}

/** What a build_release worker is told to build. */
export interface ReleaseBuildPayload {
  releaseId: string
  commitSha: string
}

/** Where the worker uploads the bundle with a single PUT. */
export interface ReleaseBundleGrant {
  url: string
  expiresAt: string
}

export type ReleaseCompleteRequest =
  | { outcome: 'ready'; sha256: string; bundleBytes: number; nodeVersion: string; buildLog: string; settings?: AppManifestSetting[] }
  | { outcome: 'failed'; reason: string; buildLog: string }

/** The tail of a build's output kept with the release. */
export const RELEASE_BUILD_LOG_MAX_LENGTH = 64_000

/** Where an App space's release bundles are, previews' included. */
export function appReleasesPath(projectId: string): string {
  return `spaces/${projectId}/releases`
}

export function releaseBundleKey(projectId: string, releaseId: string): string {
  return `${appReleasesPath(projectId)}/${releaseId}/bundle.tar.gz`
}
