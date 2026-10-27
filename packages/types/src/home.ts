import type { TaskParticipantRole } from './taskParticipant'
import type { TaskPerson, TaskSituation } from './taskSituation'

/** One task thread on Home: what it is, where it stands, and what's new in it for you. */
export interface HomeThread {
  task: { id: string; key: string; title: string; spaceSlug: string; spaceName: string }
  situation: TaskSituation
  /** Your roles on the task. */
  roles: TaskParticipantRole[]
  /** Entries by others since you last read the thread. */
  unread: number
  /** Whether someone mentioned you there and you haven't replied or marked it done. */
  mentionsYou: boolean
  lastMessage: { author: TaskPerson | null; text: string; at: string } | null
  /** When anything last happened in the thread. */
  latestActivityAt: string
  questionText?: string | null
  /** This person's treatment of the current request; distinct from task status and read state. */
  attention?: {
    source: string
    kind?: 'question' | 'mention' | 'failure'
    status: 'new' | 'acknowledged' | 'waiting' | 'later'
    reason: string | null
    remindAt: string | null
    questionIds: string[]
  }
}

/** Home: the threads where it's your move first, then every thread you're in by latest activity. */
export interface HomeData {
  needsYou: HomeThread[]
  threads: HomeThread[]
  waiting?: HomeThread[]
  later?: HomeThread[]
  newCount?: number
}

/** A task on Overview: where it stands across the workspace. */
export interface OverviewTask {
  task: { id: string; key: string; title: string; spaceSlug: string; spaceName: string }
  situation: TaskSituation
  pullRequestUrl: string | null
  completionKind?: 'merged' | 'closed' | null
}

/** Overview's groups. Each task is in exactly one, so the counts add up to the tasks shown. */
export const OVERVIEW_GROUPS = ['needsAttention', 'liveNow', 'waiting', 'notStarted', 'doneThisWeek'] as const

export type OverviewGroup = (typeof OVERVIEW_GROUPS)[number]

/** Overview, for viewers and anyone wanting the workspace picture. */
export interface OverviewData {
  /** Failed, paused on a setup failure, or asking a question. */
  needsAttention: OverviewTask[]
  /** An agent is working on it now. */
  liveNow: OverviewTask[]
  /** Something to look at, a discussion or a pull request: someone's move. */
  waiting: OverviewTask[]
  /** Nothing asked for or written yet. */
  notStarted: OverviewTask[]
  doneThisWeek: OverviewTask[]
  spaces: Array<{ slug: string; name: string } & Record<OverviewGroup, number>>
}
