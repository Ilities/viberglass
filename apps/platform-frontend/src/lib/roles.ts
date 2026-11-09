import { RUN_READER_ROLES, RUNNER_ROLES, type WorkspaceRole } from '@viberglass/types'

/** Admins and members: they create spaces and tasks, and run agents. */
export function isRunner(role: WorkspaceRole | undefined): boolean {
  return Boolean(role && RUNNER_ROLES.includes(role))
}

/** Admins, members and viewers see runs, schedules, track records and the agents list; viewers only read them. */
export function seesRuns(role: WorkspaceRole | undefined): boolean {
  return Boolean(role && RUN_READER_ROLES.includes(role))
}
