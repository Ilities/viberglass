import type { TurnArtifact } from './artifacts'

export const SPACE_BACKING_KINDS = ['git', 'files'] as const

export type SpaceBackingKind = (typeof SPACE_BACKING_KINDS)[number]

/** Limits a Files space's working files must stay within, checked when they are saved and restored. */
export const SPACE_FILES_LIMITS = {
  /** Uncompressed bytes across every file. */
  maxTotalBytes: 100 * 1024 * 1024,
  maxFiles: 10_000,
  /** Longest relative path, in characters. */
  maxPathLength: 1_024,
} as const

/** Paths a Files run writes for the platform; never saved with the space's files. */
export const SPACE_FILES_RESERVED_PATHS = ['PLAN.md', 'SUMMARY.md', 'PR_TITLE.md', 'PR_DESCRIPTION.md'] as const

/** Directory names never saved, wherever they are: dependency caches a run can rebuild. */
export const SPACE_FILES_SKIPPED_DIRECTORIES = ['node_modules', '.venv', '__pycache__', '.cache'] as const

export interface SpaceFilesManifestEntry {
  /** Relative, normalized, with forward slashes. */
  path: string
  bytes: number
  sha256: string
}

/** A saved version of a Files space's working files. A type, not an interface, so it fits in JSON columns. */
export type SpaceFilesSnapshotSummary = {
  id: string
  parentId: string | null
  fileCount: number
  totalBytes: number
  /** Saved after the agent failed, so it may be incomplete. */
  partial: boolean
  /** Compared with the files before the run. */
  changes: { added: number; changed: number; removed: number }
  createdAt: string
}

/**
 * What a Files turn saved: "Saved files · 2 added, 1 changed · 14 files", or
 * that it changed nothing. A partial save says whether the run failed or was stopped.
 */
export function savedFilesLine(files: SpaceFilesSnapshotSummary, how: 'failed' | 'stopped' = 'failed'): string {
  const { added, changed, removed } = files.changes
  const counts = [added && `${added} added`, changed && `${changed} changed`, removed && `${removed} removed`].filter(Boolean)
  const partialLead = how === 'stopped' ? 'Saved the files as they were when the run stopped' : 'Saved partial files after the run failed'
  const lead = files.partial ? partialLead : 'Saved files'
  const fileCount = `${files.fileCount} file${files.fileCount === 1 ? '' : 's'}`
  return [lead, counts.length > 0 ? counts.join(', ') : 'no changes', fileCount].join(' · ')
}

/** Said of a stopped Files turn that saved nothing, so the space's files are unchanged. */
export const NOTHING_SAVED_WHEN_STOPPED = "Nothing from this run was saved, so the space's files are as they were before it."

/** What a Files run receives: the files to start from and where to save its own. */
export interface FilesWorkspacePayload {
  spaceId: string
  /** The space's files when the run started; null for a space with nothing saved yet. */
  baseSnapshotId: string | null
  /** The id the run's saved files will get, assigned before it starts. */
  checkpointSnapshotId: string
}

export type FilesStorageOperation = 'read' | 'write'

export interface FilesStorageGrant {
  /** Presigned URL for a single GET (read) or PUT (write) of the gzip-compressed tar archive. */
  url: string
  expiresAt: string
}

export interface FilesCheckpointRequest {
  /** Lowercase hex SHA-256 of the uploaded archive. */
  sha256: string
  archiveBytes: number
  partial: boolean
  /** `.viberglass/artifacts.json` as the agent wrote it, parsed; null when it wrote none. */
  artifactManifest?: unknown
  /** Why `.viberglass/artifacts.json` couldn't be read, when it couldn't. */
  artifactManifestError?: string
}

export type FilesCheckpointResult = SpaceFilesSnapshotSummary & {
  artifacts: TurnArtifact[]
  /** Set when the run was asked for an artifact and its declaration was missing or invalid; the files were still saved. */
  artifactError: string | null
}
