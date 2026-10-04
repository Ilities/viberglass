import type { WorkspaceRole } from '@viberglass/types'
import { ROLE_LABEL } from '@/lib/roleCopy'

const ROLES: WorkspaceRole[] = ['admin', 'member', 'guest', 'viewer']

/**
 * What each workspace role may do, matching the task ask policy: being on a
 * task (owner, reviewer, watcher) is what lets members and guests ask for code,
 * and only owners, maintainers and admins steer the agent.
 */
const ROWS: Array<{ what: string; can: Record<WorkspaceRole, string> }> = [
  {
    what: 'See spaces',
    can: { admin: 'Every space', member: 'Open spaces, and private ones they belong to', guest: 'Only spaces they are invited to', viewer: 'Open spaces, and private ones they belong to' },
  },
  { what: 'Comment and post', can: { admin: 'Yes', member: 'Yes', guest: 'Yes', viewer: 'No' } },
  { what: 'Ask the agent for research or a plan', can: { admin: 'Yes', member: 'Yes', guest: 'On tasks they are on', viewer: 'No' } },
  { what: 'Ask the agent for code', can: { admin: 'Yes', member: 'On tasks they are on, or as a space maintainer', guest: 'On tasks they are on', viewer: 'No' } },
  { what: 'Pause, take over and hand back', can: { admin: 'Yes', member: 'As the task owner or a space maintainer', guest: 'As the task owner', viewer: 'No' } },
  { what: 'Agents, connections, secrets and members', can: { admin: 'Yes', member: 'No', guest: 'No', viewer: 'No' } },
]

/** A disclosure with what each workspace role can do, for invites and member lists. */
export function RoleCapabilityTable() {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-[var(--gray-11)]">What each role can do</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[var(--gray-10)]">
              <th scope="col" className="py-1 pr-3 font-medium">
                <span className="sr-only">Capability</span>
              </th>
              {ROLES.map((role) => (
                <th key={role} scope="col" className="py-1 pr-3 font-medium">
                  {ROLE_LABEL[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.what} className="border-t border-[var(--gray-5)] align-top">
                <th scope="row" className="py-1.5 pr-3 font-medium text-[var(--gray-12)]">
                  {row.what}
                </th>
                {ROLES.map((role) => (
                  <td key={role} className="py-1.5 pr-3 text-[var(--gray-11)]">
                    {row.can[role]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-[var(--gray-10)]">
          Owner, reviewer and watcher are places on one task, not roles: they say whose move it is and who hears about it. Being on a task
          is what lets a member or guest ask for code there.
        </p>
      </div>
    </details>
  )
}

/** How task participation works, for the People panel on a task. */
export function TaskParticipationHelp() {
  return (
    <details className="text-xs text-[var(--gray-10)]">
      <summary className="cursor-pointer">What owner, reviewer and watcher mean</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        <li>The owner drives the task: it&apos;s their move when nobody else is asked, and they can pause the agent or take its work over.</li>
        <li>Reviewers are asked to look when the agent writes something.</li>
        <li>Watchers follow the task on Home without being asked to do anything.</li>
        <li>Anyone on the task, guests included, can comment and ask the agent, including for code. Viewers only read.</li>
      </ul>
    </details>
  )
}
