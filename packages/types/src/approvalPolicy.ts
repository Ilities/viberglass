import type { SpaceRole } from './spaceAccess'
import type { TaskParticipantRole } from './taskParticipant'
import type { WorkspaceRole } from './workspaceRole'

/** The steps a person approves in Viberglass. The build is gated by the pull request's review instead. */
export const APPROVAL_STEPS = ['research', 'planning'] as const

export type ApprovalStep = (typeof APPROVAL_STEPS)[number]

export function isApprovalStep(value: unknown): value is ApprovalStep {
  return APPROVAL_STEPS.some((step) => step === value)
}

export interface ApprovalParticipant {
  userId: string
  role: TaskParticipantRole
}

/** The people a step's rule names on this task, before admins and maintainers (D4). */
const NAMED_APPROVERS: Record<ApprovalStep, (participants: ApprovalParticipant[]) => string[]> = {
  research: (participants) => participants.map((p) => p.userId),
  planning: (participants) => {
    const reviewers = participants.filter((p) => p.role === 'reviewer')
    return (reviewers.length > 0 ? reviewers : participants.filter((p) => p.role === 'owner')).map((p) => p.userId)
  },
}

/** Who the step is waiting on: any participant for research; the reviewers, else the owner, for the plan. */
export function namedApprovers(step: ApprovalStep, participants: ApprovalParticipant[]): string[] {
  return [...new Set(NAMED_APPROVERS[step](participants))]
}

/**
 * Whether someone may approve a step (D4, refined 2026-10-01): workspace admins
 * and the space's maintainers always may; otherwise the people the step's rule
 * names. Viewers never approve.
 */
export function canApproveStep(
  step: ApprovalStep,
  person: { userId: string; workspaceRole: WorkspaceRole; spaceRole: SpaceRole | null },
  participants: ApprovalParticipant[],
): boolean {
  if (person.workspaceRole === 'viewer') return false
  if (person.workspaceRole === 'admin' || person.spaceRole === 'maintainer') return true
  return namedApprovers(step, participants).includes(person.userId)
}

/** One step's approval as the caller sees it. */
export interface StepApproval {
  canApprove: boolean
  /** The people the step is waiting on, by its rule. */
  approvers: Array<{ id: string; name: string }>
}

export type TaskApprovals = Record<ApprovalStep, StepApproval>
