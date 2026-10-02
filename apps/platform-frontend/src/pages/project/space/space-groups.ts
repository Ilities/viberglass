import type { TaskSituationState, Ticket } from '@viberglass/types'

/** The space page's groups, in the order people read them: what's theirs first, what's finished last. */
export const SPACE_GROUPS = ['needs_you', 'agent_working', 'waiting', 'not_started', 'failed', 'pr_open', 'done'] as const

export type SpaceGroup = (typeof SPACE_GROUPS)[number]

export const SPACE_GROUP_LABEL: Record<SpaceGroup, string> = {
  needs_you: 'Needs you',
  agent_working: 'Agent working',
  waiting: 'Waiting on someone else',
  not_started: 'Not started',
  failed: 'Failed',
  pr_open: 'PR open',
  done: 'Done',
}

/** The State filter's choices: the situation states, in the product's words. */
export const STATE_FILTER_LABEL: Record<TaskSituationState, string> = {
  not_started: 'Not started',
  agent_working: 'Agent working',
  question: 'Question',
  artifact_ready: 'Ready for review',
  discussing: 'Discussing',
  failed: 'Failed',
  pr_open: 'PR open',
  done: 'Done',
}

export function groupOf(task: Ticket): SpaceGroup {
  const situation = task.situation
  if (!situation) return task.status === 'resolved' ? 'done' : 'not_started'
  if (situation.state === 'done') return 'done'
  if (situation.yourMove) return 'needs_you'
  switch (situation.state) {
    case 'agent_working':
    case 'not_started':
    case 'failed':
    case 'pr_open':
      return situation.state
    default:
      return 'waiting'
  }
}

/** Tasks by group, each group newest activity first; empty groups are left out. */
export function groupTasks(tasks: Ticket[]): Array<{ group: SpaceGroup; tasks: Ticket[] }> {
  const byGroup = new Map<SpaceGroup, Ticket[]>()
  for (const task of tasks) {
    const group = groupOf(task)
    byGroup.set(group, [...(byGroup.get(group) ?? []), task])
  }
  return SPACE_GROUPS.flatMap((group) => {
    const members = byGroup.get(group)
    return members ? [{ group, tasks: [...members].sort((a, b) => activityAt(b).localeCompare(activityAt(a))) }] : []
  })
}

function activityAt(task: Ticket): string {
  return task.lastMessage?.at && task.lastMessage.at > task.updatedAt ? task.lastMessage.at : task.updatedAt
}

/** Filters the server can't apply: they're worked out per person from each task's situation. */
export interface SituationFilters {
  state: TaskSituationState | 'all'
  ownerId: string | 'all'
  /** A person's id, `agent`, or all. */
  waitingOn: string | 'all'
}

export const NO_SITUATION_FILTERS: SituationFilters = { state: 'all', ownerId: 'all', waitingOn: 'all' }

export function matchesSituationFilters(task: Ticket, filters: SituationFilters): boolean {
  const situation = task.situation
  if (filters.state !== 'all' && situation?.state !== filters.state) return false
  if (filters.ownerId !== 'all' && task.owner?.id !== filters.ownerId) return false
  if (filters.waitingOn === 'all') return true
  const waitingOn = situation?.waitingOn
  if (filters.waitingOn === 'agent') return waitingOn?.kind === 'agent'
  return waitingOn?.kind === 'people' && waitingOn.people.some((person) => person.id === filters.waitingOn)
}

/** Everyone who owns or is waited on by one of these tasks, for the filters' choices. */
export function peopleIn(tasks: Ticket[]): { owners: Array<{ id: string; name: string }>; waitedOn: Array<{ id: string; name: string }> } {
  const owners = new Map<string, string>()
  const waitedOn = new Map<string, string>()
  for (const task of tasks) {
    if (task.owner) owners.set(task.owner.id, task.owner.name)
    if (task.situation?.waitingOn.kind === 'people') for (const person of task.situation.waitingOn.people) waitedOn.set(person.id, person.name)
  }
  const sorted = (people: Map<string, string>) => [...people].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  return { owners: sorted(owners), waitedOn: sorted(waitedOn) }
}
