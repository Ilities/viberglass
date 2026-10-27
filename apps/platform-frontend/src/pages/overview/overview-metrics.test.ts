import type { OverviewTask, TaskSituation } from '@viberglass/types'
import { attentionBadge } from './overview-metrics'

function task(id: string, situation: Partial<TaskSituation> = {}, pullRequestUrl: string | null = null): OverviewTask {
  return {
    task: { id, key: `WEB-${id}`, title: `Task ${id}`, spaceSlug: 'web', spaceName: 'Web shop' },
    situation: { state: 'discussing', label: 'Discussing', waitingOn: { kind: 'nobody' }, since: 't', yourMove: false, ...situation },
    pullRequestUrl,
  }
}


describe('attentionBadge', () => {
  const maria = { kind: 'people' as const, people: [{ id: 'm', name: 'Maria Product' }] }
  it('names who a stuck task waits for, and marks a failure as an error', () => {
    expect(attentionBadge(task('1', { state: 'question', waitingOn: maria }))).toEqual({ text: 'Waiting for Maria', tone: 'attention' })
    expect(attentionBadge(task('2', { state: 'failed', waitingOn: maria }))).toEqual({ text: 'Failed · needs Maria', tone: 'error' })
    expect(attentionBadge(task('3', { state: 'paused' }))).toEqual({ text: 'Agent paused', tone: 'attention' })
  })
})
