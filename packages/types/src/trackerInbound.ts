/**
 * What an integration reads out of an inbound webhook, in Viberglass's terms,
 * whichever tracker or system sent it.
 */
import type { Severity } from './common'

export interface TrackerPerson {
  name: string
  /** Matches them to a Viberglass account when the tracker shares it. */
  email: string | null
}

/** An issue as an event shows it. */
export interface InboundIssue {
  /** "PROJ-12" in Jira, the story id in Shortcut, "owner/repo#12" on GitHub. */
  key: string
  url: string | null
  /** The tracker's API address when it differs per site, as for Jira. */
  apiBaseUrl: string | null
  /** Missing when the event doesn't carry it; the task keeps what it has. */
  title?: string
  description?: string
  author: TrackerPerson | null
  severity: Severity
  /** Lower-cased. */
  labels: string[]
  /** `owner/repo`, for a tracker whose issues belong to a repository. */
  repository: string | null
  /** Tracker details kept on a new task, such as the issue type. */
  metadata: Record<string, unknown>
}

export interface InboundComment {
  issueKey: string
  author: TrackerPerson
  body: string
  /** Whether it mentions the connection's bot account, which asks the agent; the mention is already taken out of `body`. */
  mentionsBot: boolean
}

/** A task a webhook asks for in the space it belongs to. */
export interface InboundTask {
  title: string
  description: string
  severity: Severity
  category: string
  externalId?: string
  url?: string
}
