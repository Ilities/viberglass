/** Workspace roles. */
export const WORKSPACE_ROLES = ['admin', 'member', 'guest', 'viewer'] as const

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

/** Roles that run agents, create and change spaces, and see workspace plumbing. */
export const RUNNER_ROLES: readonly WorkspaceRole[] = ['admin', 'member']

/** Roles that may read workspace plumbing (runners, connections, templates). Viewers see what members see. */
export const PLUMBING_READER_ROLES: readonly WorkspaceRole[] = ['admin', 'member', 'viewer']

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return WORKSPACE_ROLES.some((role) => role === value)
}
