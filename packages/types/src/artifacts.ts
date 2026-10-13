import type { SpaceFilesManifestEntry, SpaceFilesSnapshotSummary } from './spaceBacking'

/** How an artifact version is shown: in the app, in an isolated frame, or only as a download. */
export const ARTIFACT_FORMATS = ['markdown', 'text', 'json', 'csv', 'image', 'pdf', 'svg', 'html', 'other'] as const
export type ArtifactFormat = (typeof ARTIFACT_FORMATS)[number]

/** Where the agent declares what a run produced, relative to its working directory. Never saved with the files. */
export const ARTIFACT_MANIFEST_PATH = '.viberglass/artifacts.json'

export const ARTIFACT_LIMITS = {
  artifactsPerRun: 20,
  filesPerVersion: 500,
  /** Larger files are kept but only downloadable. */
  previewFileBytes: 25 * 1024 * 1024,
  titleLength: 200,
} as const

/**
 * One deliverable in `.viberglass/artifacts.json`. `files` lists paths, or
 * folders ending in `/` for everything under them; it defaults to the
 * entrypoint alone. `artifactId` revises an artifact of the same task.
 */
export interface ArtifactDeclaration {
  title: string
  entrypoint: string
  files?: string[]
  artifactId?: string
}

export interface ArtifactManifestFile {
  artifacts: ArtifactDeclaration[]
}

export type ArtifactVersionStatus = 'available' | 'expired'

export interface ArtifactVersionFile extends SpaceFilesManifestEntry {
  contentType: string
}

export interface ArtifactVersionSummary {
  id: string
  artifactId: string
  /** 1 for the first version of the artifact. */
  number: number
  format: ArtifactFormat
  entrypoint: string
  fileCount: number
  totalBytes: number
  status: ArtifactVersionStatus
  /** The run that produced it, or the person whose edit did. */
  producedBy: { kind: 'run'; jobId: string; taskId: string | null } | { kind: 'person'; userId: string | null }
  createdAt: string
}

export interface ArtifactSummary {
  id: string
  spaceId: string
  taskId: string | null
  taskKey: string | null
  title: string
  currentVersion: ArtifactVersionSummary | null
  versionCount: number
  updatedAt: string
}

export interface ArtifactDetail extends ArtifactSummary {
  versions: ArtifactVersionSummary[]
}

/** How the app shows a version: text it renders itself, a frame on the preview origin, or nothing but a download. */
export type ArtifactPreview =
  | { kind: 'text'; format: 'markdown' | 'text' | 'json' | 'csv'; content: string; truncated: boolean }
  | { kind: 'frame'; format: 'html' | 'image' | 'pdf' | 'svg'; url: string; expiresAt: string }
  | { kind: 'download'; reason: string }
  | { kind: 'expired' }

/** A run's artifacts as the thread shows them. */
export type TurnArtifact = {
  artifactId: string
  versionId: string
  title: string
  number: number
  format: ArtifactFormat
}

/**
 * A person's upload, edit or deletion made while a run held the space: it
 * waits and is saved once the run has saved, or failed then because the run
 * changed the same file, and keeps its content until someone dismisses it.
 */
export interface SpaceFileChangeSummary {
  id: string
  kind: 'write' | 'remove'
  path: string
  status: 'waiting' | 'failed'
  error: string | null
  /** Whether its content can be downloaded, which a failed text save needs to be recovered. */
  hasContent: boolean
  createdBy: string | null
  createdAt: string
}

/** The space's working files, as the Files view lists them. */
export interface SpaceFilesListing {
  snapshot: SpaceFilesSnapshotSummary | null
  files: SpaceFilesManifestEntry[]
  /** A run or another person is changing the files right now, so changes wait until it has saved. */
  busy: boolean
  /** Changes waiting for the space, and ones that couldn't be saved after it, oldest first. */
  changes: SpaceFileChangeSummary[]
}

/** What became of a person's change: saved at once, or waiting for the run holding the space. */
export type SpaceFileChangeResult = { snapshot: SpaceFilesSnapshotSummary } | { queued: SpaceFileChangeSummary }

/** A text file opened in the editor: its content and the hash a save must match. */
export interface SpaceTextFile {
  path: string
  content: string
  sha256: string
}

export interface SaveSpaceTextFileRequest {
  path: string
  content: string
  /** The hash of the file as it was opened; null to create a new file. */
  baseSha256: string | null
}

/** Text the editor opens, by extension; larger files are download only. */
export const SPACE_TEXT_FILE_EXTENSIONS = ['md', 'markdown', 'txt', 'csv', 'json', 'yaml', 'yml'] as const
export const SPACE_TEXT_FILE_MAX_BYTES = 1024 * 1024

export const SPACE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024
