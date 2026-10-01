/** People on a task (plan §9): who asked, who owns it, who reviews it and who follows it. */
export const TASK_PARTICIPANT_ROLES = ['requester', 'owner', 'reviewer', 'watcher'] as const

export type TaskParticipantRole = (typeof TASK_PARTICIPANT_ROLES)[number]

export interface TaskParticipant {
  userId: string
  name: string
  email: string
  role: TaskParticipantRole
  addedAt: string
}

export function isTaskParticipantRole(value: unknown): value is TaskParticipantRole {
  return TASK_PARTICIPANT_ROLES.some((role) => role === value)
}
