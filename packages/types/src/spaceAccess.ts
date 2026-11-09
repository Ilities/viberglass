import { OPEN_SPACE_ROLES, RUN_READER_ROLES, RUNNER_ROLES, SPACE_MEMBER_ROLES, type WorkspaceRole } from './workspaceRole'

/** Roles inside one space. Workspace admins are maintainers of every space. */
export const SPACE_ROLES = ['maintainer', 'member'] as const

export type SpaceRole = (typeof SPACE_ROLES)[number]

export interface SpaceMember {
  userId: string
  name: string
  /** Null for callers who don't see email addresses. */
  email: string | null
  workspaceRole: WorkspaceRole
  role: SpaceRole
  addedAt: string
}

export function isSpaceRole(value: unknown): value is SpaceRole {
  return SPACE_ROLES.some((role) => role === value)
}

/**
 * Who sees a space: admins see all; members and viewers see open spaces and
 * private ones they belong to; guests only spaces they belong to; app users none.
 */
export function canSeeSpace(workspaceRole: WorkspaceRole, space: { isPrivate: boolean }, membership: SpaceRole | null): boolean {
  if (workspaceRole === 'admin') return true
  if (!SPACE_MEMBER_ROLES.includes(workspaceRole)) return false
  if (membership) return true
  return OPEN_SPACE_ROLES.includes(workspaceRole) && !space.isPrivate
}

/** Who changes a space's settings, members and policies. */
export function canMaintainSpace(workspaceRole: WorkspaceRole, membership: SpaceRole | null): boolean {
  return workspaceRole === 'admin' || membership === 'maintainer'
}

/** What the caller may do in one space; the UI hides the rest. Archiving tasks in bulk is for those who maintain it. */
export interface SpaceCapabilities {
  membership: SpaceRole | null
  canMaintain: boolean
  /** Guests and viewers don't create tasks. */
  canCreateTasks: boolean
  /** Runs, Schedules and Track record: admins and members, and viewers to read. */
  canSeeRuns: boolean
}

export function spaceCapabilities(workspaceRole: WorkspaceRole, membership: SpaceRole | null): SpaceCapabilities {
  return {
    membership,
    canMaintain: canMaintainSpace(workspaceRole, membership),
    canCreateTasks: RUNNER_ROLES.includes(workspaceRole),
    canSeeRuns: RUN_READER_ROLES.includes(workspaceRole),
  }
}
