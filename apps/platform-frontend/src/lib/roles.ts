import { RUNNER_ROLES, type WorkspaceRole } from '@viberglass/types'

/** Admins and members: they create spaces and tasks, and see runs. */
export function isRunner(role: WorkspaceRole | undefined): boolean {
  return Boolean(role && RUNNER_ROLES.includes(role))
}
