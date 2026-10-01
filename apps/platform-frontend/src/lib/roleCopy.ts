import type { WorkspaceRole } from '@viberglass/types'

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
  viewer: 'Viewer',
}

/** What each role can do, in the words of ADR 0005. */
export const ROLE_DESCRIPTION: Record<WorkspaceRole, string> = {
  admin: 'Everything, including agents, connections, secrets and members.',
  member: 'Sees open spaces, creates spaces and tasks, runs agents, comments and approves.',
  guest: 'Only the spaces they are invited to: comments, answers agent questions and approves as a reviewer.',
  viewer: 'Read-only: sees every open space and task, but can’t create, comment, approve or run anything.',
}
