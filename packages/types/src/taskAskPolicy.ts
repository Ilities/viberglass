import type { SpaceRole } from './spaceAccess'
import type { TaskChangeCapabilities } from './taskChangePolicy'
import type { TaskParticipantRole } from './taskParticipant'
import type { WorkspaceRole } from './workspaceRole'

export interface AskingParticipant {
  userId: string
  role: TaskParticipantRole
}

export interface AskingPerson {
  userId: string
  workspaceRole: WorkspaceRole
  spaceRole: SpaceRole | null
}

/** Roles that post on tasks and may ask the agent. Viewers only read. */
export const TASK_POSTING_ROLES: readonly WorkspaceRole[] = ['admin', 'member', 'guest']

const isOnTask = (person: AskingPerson, participants: AskingParticipant[]) =>
  participants.some((participant) => participant.userId === person.userId)

/**
 * Who may ask the agent for a plan or a reply: admins and
 * members, and guests once they're on the task. Viewers never ask.
 */
export function canAskAgent(person: AskingPerson, participants: AskingParticipant[]): boolean {
  if (person.workspaceRole === 'admin' || person.workspaceRole === 'member') return true
  return person.workspaceRole === 'guest' && isOnTask(person, participants)
}

/**
 * Who may ask the agent to write code, the step that changes the repository:
 * workspace admins, the space's maintainers, and anyone on the task, guests
 * included. Viewers never do.
 */
export function canAskForCode(person: AskingPerson, participants: AskingParticipant[]): boolean {
  if (!TASK_POSTING_ROLES.includes(person.workspaceRole)) return false
  if (person.workspaceRole === 'admin' || person.spaceRole === 'maintainer') return true
  return isOnTask(person, participants)
}

/**
 * Who may steer the agent on a task: interrupt its turn, pause and resume it,
 * take over its work and hand it back. The task's owner, the space's
 * maintainers and workspace admins.
 */
export function canSteerAgent(person: AskingPerson, participants: AskingParticipant[]): boolean {
  return isOwnerOrMaintainer(person, participants)
}

/** Who may make an App space's change live: the task's owner, the space's maintainers and workspace admins. */
export function canMakeChangeLive(person: AskingPerson, participants: AskingParticipant[]): boolean {
  return isOwnerOrMaintainer(person, participants)
}

/** Who may give an App space task's next agent turn a copy of the app's data: the space's maintainers and workspace admins. */
export function canGrantAppData(person: AskingPerson): boolean {
  if (!TASK_POSTING_ROLES.includes(person.workspaceRole)) return false
  return person.workspaceRole === 'admin' || person.spaceRole === 'maintainer'
}

function isOwnerOrMaintainer(person: AskingPerson, participants: AskingParticipant[]): boolean {
  if (!TASK_POSTING_ROLES.includes(person.workspaceRole)) return false
  if (person.workspaceRole === 'admin' || person.spaceRole === 'maintainer') return true
  return participants.some((participant) => participant.userId === person.userId && participant.role === 'owner')
}

/** Who the agent mentions when an artifact is ready: the task's reviewers, else its owner. */
export function artifactReviewers(participants: AskingParticipant[]): string[] {
  const reviewers = participants.filter((p) => p.role === 'reviewer')
  return [...new Set((reviewers.length > 0 ? reviewers : participants.filter((p) => p.role === 'owner')).map((p) => p.userId))]
}

/** What the caller may say on a task, and ask the agent for. Viewers only read. */
export interface TaskAskCapabilities {
  canPost: boolean
  canAsk: boolean
  canAskForCode: boolean
  canSteer: boolean
  /** In an App space, making the task's change live. */
  canMakeLive: boolean
  /** In an App space, giving the agent's next turn a copy of the app's data. */
  canGrantAppData: boolean
}

/** What the caller may do on a task. */
export type TaskCapabilities = TaskAskCapabilities & TaskChangeCapabilities
