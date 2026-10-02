import { RUNNER_ROLES, type WorkspaceRole } from './workspaceRole'

/** Roles inside one space. Workspace admins are maintainers of every space. */
export const SPACE_ROLES = ['maintainer', 'member'] as const

export type SpaceRole = (typeof SPACE_ROLES)[number]

export interface SpaceMember {
  userId: string
  name: string
  email: string
  workspaceRole: WorkspaceRole
  role: SpaceRole
  addedAt: string
}

export function isSpaceRole(value: unknown): value is SpaceRole {
  return SPACE_ROLES.some((role) => role === value)
}

/**
 * Who sees a space: admins see all; guests only spaces they belong to; everyone
 * else sees open spaces, and private ones they belong to.
 */
export function canSeeSpace(workspaceRole: WorkspaceRole, space: { isPrivate: boolean }, membership: SpaceRole | null): boolean {
  if (workspaceRole === 'admin') return true
  if (membership) return true
  return workspaceRole !== 'guest' && !space.isPrivate
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
  /** Runs and Schedules are engineers' views: admins and members only. */
  canSeeRuns: boolean
}

export function spaceCapabilities(workspaceRole: WorkspaceRole, membership: SpaceRole | null): SpaceCapabilities {
  const runs = RUNNER_ROLES.includes(workspaceRole)
  return { membership, canMaintain: canMaintainSpace(workspaceRole, membership), canCreateTasks: runs, canSeeRuns: runs }
}
