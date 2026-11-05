/** A copy of an App space's data waiting for the task's next agent turn. */
export interface AppDataGrant {
  id: string
  /** When the copy was made: the live data as of then. */
  copiedAt: string
  grantedBy: string | null
}
