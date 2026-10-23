import type { AgentTrackRecordTask } from '@viberglass/types'
import { summarize, taskFacts } from './track-record-summary'

function task(overrides: Partial<AgentTrackRecordTask>): AgentTrackRecordTask {
  return {
    ticketId: 't',
    key: 'WEB-1',
    title: 'Task',
    pullRequest: null,
    built: false,
    planRounds: 0,
    questions: 0,
    takenOver: false,
    runs: 1,
    failedRuns: 0,
    reviewComments: null,
    costUsd: null,
    costEstimated: false,
    ...overrides,
  }
}

describe('summarize', () => {
  it('counts merges against decided pull requests and spreads all cost over the merges', () => {
    const summary = summarize({
      agent: 'a',
      model: 'm',
      tasks: [
        task({ pullRequest: 'merged', built: true, planRounds: 1, costUsd: 2, reviewComments: 1 }),
        task({ pullRequest: 'closed', built: true, planRounds: 3, costUsd: 3, questions: 2, takenOver: true, reviewComments: 3 }),
        task({ pullRequest: 'open', planRounds: 1, costUsd: 1, costEstimated: true }),
        task({}),
      ],
    })

    expect(summary).toEqual({
      tasks: 4,
      merged: { count: 1, of: 2 },
      builtFromFirstPlan: { count: 1, of: 2 },
      questionsPerTask: 0.5,
      takenOver: { count: 1, of: 4 },
      reviewComments: 2,
      costPerMerge: 6,
      costEstimated: true,
    })
  })

  it('has no cost per merge without a merge or a reported cost', () => {
    expect(summarize({ agent: 'a', model: null, tasks: [task({ costUsd: 4 })] }).costPerMerge).toBeNull()
    expect(summarize({ agent: 'a', model: null, tasks: [task({ pullRequest: 'merged' })] }).costPerMerge).toBeNull()
  })
})

describe('taskFacts', () => {
  it('says how the task went', () => {
    expect(taskFacts(task({ pullRequest: 'merged', built: true, planRounds: 2, questions: 1, failedRuns: 3, reviewComments: 1 }))).toEqual([
      'Merged',
      'built after 2 plans',
      '1 question',
      '3 failed runs',
      '1 review comment',
    ])
    expect(taskFacts(task({ built: true, planRounds: 1, takenOver: true }))).toEqual(['No pull request', 'built from the first plan', 'engineer took over'])
    expect(taskFacts(task({ planRounds: 3 }))).toEqual(['No pull request', '3 plans, not built'])
  })
})
