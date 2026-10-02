import type { SpaceRole } from './spaceAccess'
import type { TaskParticipantRole } from './taskParticipant'
import type { WorkspaceRole } from './workspaceRole'

/** Changes to the task itself: its details, archive and done state (`edit`), and hard delete. */
export const TASK_CHANGES = ['edit', 'delete'] as const

export type TaskChange = (typeof TASK_CHANGES)[number]

export interface TaskChangeParticipant {
  userId: string
  role: TaskParticipantRole
}

/** The task's own people who may edit it, besides admins and the space's maintainers. */
const EDITING_PARTICIPANT_ROLES: TaskParticipantRole[] = ['requester', 'owner']

/**
 * Who may change a task: hard delete is for workspace admins;
 * editing, archiving and marking done for admins, the space's maintainers and
 * the task's requester and owner. Guests and viewers never.
 */
export function canChangeTask(
  change: TaskChange,
  person: { userId: string; workspaceRole: WorkspaceRole; spaceRole: SpaceRole | null },
  participants: TaskChangeParticipant[],
): boolean {
  if (person.workspaceRole === 'admin') return true
  if (change === 'delete' || person.workspaceRole === 'guest' || person.workspaceRole === 'viewer') return false
  if (person.spaceRole === 'maintainer') return true
  return participants.some((p) => p.userId === person.userId && EDITING_PARTICIPANT_ROLES.includes(p.role))
}

/** Which changes the caller may make to a task, for the UI to show only those. */
export interface TaskChangeCapabilities {
  /** Edit details, archive, mark done or reopen. */
  canEdit: boolean
  canDelete: boolean
}
