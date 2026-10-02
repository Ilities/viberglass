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
}

/** Home: the threads where it's your move first, then every thread you're in by latest activity. */
export interface HomeData {
  needsYou: HomeThread[]
  threads: HomeThread[]
}

/** A task on Overview: where it stands across the workspace. */
export interface OverviewTask {
  task: { id: string; key: string; title: string; spaceSlug: string; spaceName: string }
  situation: TaskSituation
  pullRequestUrl: string | null
}

/** Overview, for viewers and anyone wanting the workspace picture. */
export interface OverviewData {
  /** Failed, or waiting on people for longer than a day. */
  stuck: OverviewTask[]
  inProgress: OverviewTask[]
  doneThisWeek: OverviewTask[]
  liveNow: OverviewTask[]
  spaces: Array<{ slug: string; name: string; inProgress: number; stuck: number; doneThisWeek: number }>
}
