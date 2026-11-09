/** Workspace roles. */
export const WORKSPACE_ROLES = ['admin', 'member', 'guest', 'viewer', 'app_user'] as const

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

/** Roles that run agents, create and change spaces, and see workspace plumbing. */
export const RUNNER_ROLES: readonly WorkspaceRole[] = ['admin', 'member']

/** Roles that see runs, schedules, track records and the agents list. Viewers only read them. */
export const RUN_READER_ROLES: readonly WorkspaceRole[] = ['admin', 'member', 'viewer']

/** Roles that work in spaces. App users only open the apps they're given. */
export const SPACE_MEMBER_ROLES: readonly WorkspaceRole[] = ['admin', 'member', 'guest', 'viewer']

/** Roles that see open spaces without joining them. */
export const OPEN_SPACE_ROLES: readonly WorkspaceRole[] = ['admin', 'member', 'viewer']

/** Whether a role sees other people's email addresses: guests and viewers see names only. */
export function seesEmails(role: WorkspaceRole): boolean {
  return RUNNER_ROLES.includes(role)
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return WORKSPACE_ROLES.some((role) => role === value)
}
