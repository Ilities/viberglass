export const SPACE_BACKING_KINDS = ['git', 'files'] as const

export type SpaceBackingKind = (typeof SPACE_BACKING_KINDS)[number]

/** Shown where a Files space is asked to build code: its tasks produce files, not pull requests. */
export const FILES_BUILD_UNAVAILABLE = 'Files spaces save the agent’s files instead of opening pull requests. Ask the agent in the conversation.'

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
}

export type FilesCheckpointResult = SpaceFilesSnapshotSummary
