import type { AppPreviewState } from './appPreview'
import type { ArtifactCover, ArtifactFormat } from './artifacts'

/** How Outputs groups what was made, for its filters. */
export const OUTPUT_KINDS = ['app', 'deck', 'doc', 'data', 'pdf', 'image'] as const
export type OutputKind = (typeof OUTPUT_KINDS)[number]

export type OutputProducer = 'agent' | 'person'

/** Where an app's release stands: serving now, set aside by a rollback, served before, or never served. */
export type OutputReleaseStatus = 'live' | 'building' | 'failed' | 'rolled_back' | 'was_live' | 'ready'

interface OutputBase {
  /** Unique across kinds, such as `artifact:<version id>`. */
  id: string
  spaceId: string
  spaceSlug: string
  spaceName: string
  taskId: string | null
  taskKey: string | null
  createdAt: string
}

/** One version of an artifact. */
export interface ArtifactOutput extends OutputBase {
  type: 'artifact'
  /** Null for formats Outputs doesn't group, which only All shows. */
  kind: Exclude<OutputKind, 'app'> | null
  artifactId: string
  versionId: string
  title: string
  number: number
  format: ArtifactFormat
  entrypoint: string
  cover: ArtifactCover | null
  /** The artifact's current version. */
  current: boolean
  /** No longer kept, so it can't be opened. */
  expired: boolean
  producedBy: { kind: 'agent' } | { kind: 'person'; name: string | null }
  /** A short-lived link to an image version, which is its own cover; null for other formats or without a preview origin. */
  imageUrl: string | null
}

/** One release of an app, built from the space's default branch. */
export interface ReleaseOutput extends OutputBase {
  type: 'release'
  kind: 'app'
  releaseId: string
  commitSha: string
  status: OutputReleaseStatus
  /** Where people open the app; null when apps aren't served here. */
  appUrl: string | null
}

/** A task's change, running in a preview. */
export interface PreviewOutput extends OutputBase {
  type: 'preview'
  kind: 'app'
  previewId: string
  taskTitle: string
  state: AppPreviewState
}

export type OutputItem = ArtifactOutput | ReleaseOutput | PreviewOutput

export interface OutputsQuery {
  kind?: OutputKind
  spaceId?: string
  producer?: OutputProducer
  q?: string
  /** Only each artifact's current version and each app's newest release. */
  latest?: boolean
  cursor?: string
}

export interface OutputsPage {
  items: OutputItem[]
  /** Pass back as `cursor` for the next page; null on the last one. */
  nextCursor: string | null
}

/** The filters' counts, and what the last seven days made. */
export interface OutputsSummary {
  counts: Record<OutputKind | 'all', number>
  week: { made: number; spaces: number; releasesLive: number }
}
