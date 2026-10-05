import type { OverviewData, OverviewTask, TaskSituation } from '@viberglass/types'
import { attentionBadge, overviewMetrics } from './overview-metrics'

function task(id: string, situation: Partial<TaskSituation> = {}, pullRequestUrl: string | null = null): OverviewTask {
  return {
    task: { id, key: `WEB-${id}`, title: `Task ${id}`, spaceSlug: 'web', spaceName: 'Web shop' },
    situation: { state: 'discussing', label: 'Discussing', waitingOn: { kind: 'nobody' }, since: 't', yourMove: false, ...situation },
    pullRequestUrl,
  }
}

const OVERVIEW: OverviewData = {
  needsAttention: [task('1', { state: 'question' }), task('2', { state: 'failed' }), task('3')],
  liveNow: [task('4', { state: 'agent_working' })],
  waiting: [task('5'), task('6')],
  notStarted: [],
  doneThisWeek: [task('7', { state: 'done' }, 'https://github.com/x/y/pull/1'), task('8', { state: 'done' })],
  spaces: [],
}

describe('overviewMetrics', () => {
  it("counts what's moving, what's stuck and on what, and how work got done", () => {
    expect(overviewMetrics(OVERVIEW)).toEqual([
      { title: 'Working now', value: 3, detail: '1 agent · 2 with people' },
      { title: 'Needs attention', value: 3, detail: '1 question · 1 failed turn · 1 waiting long' },
      { title: 'Done this week', value: 2, detail: '1 merged · 1 closed manually' },
    ])
  })
})

describe('attentionBadge', () => {
  const maria = { kind: 'people' as const, people: [{ id: 'm', name: 'Maria Product' }] }
  it('names who a stuck task waits for, and marks a failure as an error', () => {
    expect(attentionBadge(task('1', { state: 'question', waitingOn: maria }))).toEqual({ text: 'Waiting for Maria', tone: 'attention' })
    expect(attentionBadge(task('2', { state: 'failed', waitingOn: maria }))).toEqual({ text: 'Failed · needs Maria', tone: 'error' })
    expect(attentionBadge(task('3', { state: 'paused' }))).toEqual({ text: 'Agent paused', tone: 'attention' })
  })
})
