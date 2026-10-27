import type { OverviewTask } from '@viberglass/types'


/** The badge on a task needing attention: who it's waiting for, or what broke. */
export function attentionBadge(entry: OverviewTask): { text: string; tone: 'attention' | 'error' } {
  const { situation } = entry
  const people = situation.waitingOn.kind === 'people' ? situation.waitingOn.people.map((person) => person.name.split(' ')[0]) : []
  const who = people.length > 0 ? people.join(' and ') : null
  if (situation.state === 'failed') return { text: who ? `Failed · needs ${who}` : 'Failed', tone: 'error' }
  if (situation.state === 'paused') return { text: 'Agent paused', tone: 'attention' }
  return { text: who ? `Waiting for ${who}` : situation.label, tone: 'attention' }
}
