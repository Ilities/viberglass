export const SPACE_BACKING_KINDS = ['git', 'files'] as const

export type SpaceBackingKind = (typeof SPACE_BACKING_KINDS)[number]

export const FILES_RUNS_UNAVAILABLE = 'Agent runs in Files spaces are not available yet. You can create tasks and manage the space.'
