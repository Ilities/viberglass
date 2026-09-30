/**
 * One run as the eval corpus records it: the run manifest, and what happened
 * to the pull request it opened. Admin-only (GET /api/run-manifests).
 *
 * Every field the platform did not record is null. Null usage means the CLI
 * reported none; it is not zero.
 */
export type RunCostProvenance = 'actual' | 'estimated' | 'unavailable'
export type RunPullRequestState = 'open' | 'closed' | 'merged'

export interface RunTokenUsage {
  inputTokens: number | null
  outputTokens: number | null
  reasoningOutputTokens: number | null
  cacheReadInputTokens: number | null
  cacheCreationInputTokens: number | null
}

export interface RunPullRequestOutcome {
  url: string
  /** Null until a check succeeds. */
  state: RunPullRequestState | null
  mergedAt: string | null
  closedAt: string | null
  commentCount: number | null
  reviewCommentCount: number | null
  /** Null until the outcome sweeper has looked at the PR. */
  checkedAt: string | null
  lastError: string | null
}

export interface RunRecord {
  jobId: string
  jobKind: string
  projectSlug: string | null
  ticketId: string | null
  ticketTitle: string | null
  /** The Viberglass agent (clanker) that ran, by its name in Viberglass. */
  clankerName: string | null
  clankerSlug: string | null
  requestedAgent: string | null
  /** The harness the clanker ran, e.g. `opencode`. */
  agent: string | null
  modelSnapshot: string | null
  harnessVersion: string | null
  repository: string
  baseBranch: string | null
  branch: string | null
  baseSha: string | null
  commitSha: string | null
  workerType: string | null
  computeImage: string | null
  configHash: string | null
  instructionsHash: string | null
  promptHash: string | null
  promptCharacters: number | null
  changedFileCount: number | null
  success: boolean | null
  stopReason: string | null
  errorMessage: string | null
  usageAvailable: boolean | null
  usage: RunTokenUsage | null
  costUsd: number | null
  costProvenance: RunCostProvenance | null
  dispatchedAt: string
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  manifestVersion: number
  pullRequest: RunPullRequestOutcome | null
}

export interface RunRecordPage {
  records: RunRecord[]
  /** Pass back as `cursor` for the next, older page. Null on the last page. */
  nextCursor: string | null
}
