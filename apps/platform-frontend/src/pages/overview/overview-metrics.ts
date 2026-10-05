import type { OverviewData, OverviewTask } from '@viberglass/types'

export interface OverviewMetric {
  title: string
  value: number
  detail: string
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "1 question · 1 failed turn": what the tasks needing attention are stuck on. */
function attentionDetail(tasks: OverviewTask[]): string {
  const count = (state: string) => tasks.filter((entry) => entry.situation.state === state).length
  const questions = count('question')
  const failed = count('failed')
  const paused = count('paused')
  const waiting = tasks.length - questions - failed - paused
  const parts = [
    questions && plural(questions, 'question'),
    failed && plural(failed, 'failed turn'),
    paused && plural(paused, 'paused agent'),
    waiting && plural(waiting, 'waiting long', 'waiting long'),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Nothing stuck'
}

/** The three numbers at the top of Overview: what's moving, what's stuck, and what got done. */
export function overviewMetrics(overview: OverviewData): OverviewMetric[] {
  const merged = overview.doneThisWeek.filter((entry) => entry.pullRequestUrl).length
  return [
    {
      title: 'Working now',
      value: overview.liveNow.length + overview.waiting.length,
      detail: `${plural(overview.liveNow.length, 'agent')} · ${overview.waiting.length} with people`,
    },
    { title: 'Needs attention', value: overview.needsAttention.length, detail: attentionDetail(overview.needsAttention) },
    {
      title: 'Done this week',
      value: overview.doneThisWeek.length,
      detail: `${merged} merged · ${overview.doneThisWeek.length - merged} closed manually`,
    },
  ]
}

/** The badge on a task needing attention: who it's waiting for, or what broke. */
export function attentionBadge(entry: OverviewTask): { text: string; tone: 'attention' | 'error' } {
  const { situation } = entry
  const people = situation.waitingOn.kind === 'people' ? situation.waitingOn.people.map((person) => person.name.split(' ')[0]) : []
  const who = people.length > 0 ? people.join(' and ') : null
  if (situation.state === 'failed') return { text: who ? `Failed · needs ${who}` : 'Failed', tone: 'error' }
  if (situation.state === 'paused') return { text: 'Agent paused', tone: 'attention' }
  return { text: who ? `Waiting for ${who}` : situation.label, tone: 'attention' }
}
