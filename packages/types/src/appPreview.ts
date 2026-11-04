import type { AppPower } from './appHosting'

/** What a preview is doing now. `building` waits for its build; `failed` means it was tried and isn't serving. */
export type AppPreviewState = 'off' | 'building' | 'starting' | 'running' | 'stopping' | 'failed'

/** Preview addresses start with this, and App space names can't. */
export const PREVIEW_ADDRESS_PREFIX = 'preview-'

/** A change's preview, as the task page shows it. */
export interface AppPreview {
  id: string
  pullRequestUrl: string
  /** The commit Try it last asked for. */
  commitSha: string
  power: AppPower
  state: AppPreviewState
  statusMessage: string | null
  /** The newest commit that came up healthy in it; Make it live needs the change's latest. */
  triedCommitSha: string | null
  /** Where people open it; null when apps aren't served on this workspace. */
  url: string | null
}

/** Try it: run the change as it is at `headSha`. */
export interface TryChangeRequest {
  pullRequestUrl: string
  headSha: string
}
