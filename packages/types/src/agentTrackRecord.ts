/** How one task went, credited to the agent and model that built it, or planned it when nothing was built. */
export interface AgentTrackRecordTask {
  ticketId: string
  key: string
  title: string
  /** Merged when any of the task's pull requests was. Null when it has none, or none with a known outcome. */
  pullRequest: 'merged' | 'open' | 'closed' | null
  built: boolean
  /** Plans the agent wrote before the first build, or so far when nothing was built. */
  planRounds: number
  questions: number
  takenOver: boolean
  runs: number
  failedRuns: number
  /** Null when no pull request's review was read. */
  reviewComments: number | null
  /** Null when no run reported a cost. */
  costUsd: number | null
  /** Some of the cost is the harness's flat estimate, not what the run reported. */
  costEstimated: boolean
}

export interface AgentTrackRecordEntry {
  /** The harness id. */
  agent: string
  /** What the harness reported running, else what the runner was set to use; null when it picked its own. */
  model: string | null
  /** Newest first. */
  tasks: AgentTrackRecordTask[]
}

/** How the agents' tasks in a space went, one entry per harness and model. */
export interface AgentTrackRecord {
  entries: AgentTrackRecordEntry[]
}
