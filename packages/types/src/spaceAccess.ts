import type { WorkspaceRole } from './workspaceRole'

/** Roles inside one space (ADR 0005). Workspace admins are maintainers of every space. */
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
