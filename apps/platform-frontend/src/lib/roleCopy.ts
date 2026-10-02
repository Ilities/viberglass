import type { WorkspaceRole } from '@viberglass/types'

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
  viewer: 'Viewer',
}

/** What each role can do, in the words people see on the roles' pickers and invites. */
export const ROLE_DESCRIPTION: Record<WorkspaceRole, string> = {
  admin: 'Everything, including agents, connections, secrets and members.',
  member: 'Sees open spaces, creates spaces and tasks, comments and asks agents; asks for code on tasks they’re on.',
  guest: 'Only the spaces they are invited to: comments, and asks the agent, including to build, on tasks they’re on.',
  viewer: 'Read-only: sees every open space and task, but can’t create, comment or ask the agent anything.',
}
