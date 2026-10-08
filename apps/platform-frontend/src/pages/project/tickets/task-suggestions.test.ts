import type { PartRange, TaskPlanParts, TaskPlanPartStatus } from '@viberglass/types'
import { buildSuggestions, countNewComments, retrySuggestion, suggestTaskActions, type TaskSuggestionInput } from './task-suggestions'

const doc = (content: string) => ({ content })

function input(overrides: Partial<TaskSuggestionInput> = {}): TaskSuggestionInput {
  return {
    ticket: { status: 'open' },
    plan: doc(''),
    capabilities: { canPost: true, canAsk: true, canAskForCode: false, canSteer: false, canEdit: false, canDelete: false },
    newComments: 0,
    latestTurn: null,
    agentWorking: false,
    ...overrides,
  }
}

const labels = (overrides: Partial<TaskSuggestionInput>) => suggestTaskActions(input(overrides)).map((suggestion) => suggestion.label)

describe('suggestTaskActions', () => {
  it('starts a new task with the plan', () => {
    expect(suggestTaskActions(input())).toEqual([{ action: 'plan', label: 'Write the plan' }])
  })

  it('offers to revise the plan with its open comments', () => {
    expect(labels({ plan: doc('# P'), newComments: 1 })).toEqual(['Revise the plan with 1 comment'])
    expect(labels({ plan: doc('# P'), newComments: 2 })).toEqual(['Revise the plan with 2 comments'])
  })

  it('offers the build last to whoever may ask for code, with or without a plan', () => {
    const coder = { canPost: true, canAsk: true, canAskForCode: true, canSteer: false, canEdit: false, canDelete: false }
    expect(labels({ capabilities: coder, plan: doc('# P') })).toEqual(['Build it'])
    expect(labels({ capabilities: coder })).toEqual(['Write the plan', 'Build it'])
    expect(labels({ plan: doc('# P') })).toEqual([])
  })

  it('offers nothing to someone who may not ask, and no build retry to someone who may not ask for code', () => {
    expect(labels({ capabilities: { canPost: true, canAsk: false, canAskForCode: false, canSteer: false, canEdit: false, canDelete: false } })).toEqual([])
    expect(labels({ capabilities: null })).toEqual([])
    expect(retrySuggestion(input({ latestTurn: { action: 'code', status: 'failed' } }))).toBeNull()
  })

  it('offers to try a failed turn again, asking for the same thing, apart from the other suggestions', () => {
    const failed = input({ latestTurn: { action: 'plan', status: 'failed' } })
    expect(retrySuggestion(failed)).toEqual({ action: 'plan', label: 'Try again' })
    expect(suggestTaskActions(failed).map((suggestion) => suggestion.label)).not.toContain('Try again')
    expect(retrySuggestion(input({ latestTurn: { action: 'plan', status: 'cancelled' } }))).toBeNull()
    expect(retrySuggestion(input({ latestTurn: { action: 'plan', status: 'failed' }, agentWorking: true }))).toBeNull()
  })

  it('tries again with the agent whose turn failed', () => {
    const latestTurn = { action: 'plan' as const, status: 'failed', agent: { id: 'qwen', name: 'Qwen' } }
    expect(retrySuggestion(input({ latestTurn }))).toEqual({ action: 'plan', label: 'Try again with Qwen', agentId: 'qwen' })
  })

  it("doesn't offer to try again when the setup has to be fixed first", () => {
    const failed = { latestTurn: { action: 'plan' as const, status: 'failed' } }
    expect(retrySuggestion(input({ ...failed, lastFailure: { category: 'setup', retryable: false } }))).toBeNull()
    expect(retrySuggestion(input({ ...failed, lastFailure: { category: 'setup', retryable: true } }))).not.toBeNull()
    expect(retrySuggestion(input({ ...failed, lastFailure: { category: 'agent', retryable: true } }))).not.toBeNull()
  })

  it('offers nothing while the agent works, or once the task is done', () => {
    expect(labels({ agentWorking: true })).toEqual([])
    expect(labels({ ticket: { status: 'resolved' } })).toEqual([])
  })
})

describe('countNewComments', () => {
  it("counts the open comments made since the document's latest version", () => {
    const comments = [
      { status: 'open', createdAt: '2026-10-01T10:00:00.000Z' },
      { status: 'open', createdAt: '2026-10-01T10:10:00.000Z' },
      { status: 'resolved', createdAt: '2026-10-01T10:11:00.000Z' },
    ]
    expect(countNewComments(comments, '2026-10-01T10:05:00.000Z')).toBe(1)
    expect(countNewComments(comments, '2026-10-01T09:00:00.000Z')).toBe(2)
  })

  it('offers a summary once the thread has grown, after the plan and before the build', () => {
    const plan = { plan: doc('# P') }
    expect(labels({ ...plan, sinceSummary: { finishedTurns: 2, messages: 9 } })).toEqual([])
    expect(labels({ ...plan, sinceSummary: { finishedTurns: 3, messages: 0 } })).toEqual(['Summarise so far'])
    expect(
      labels({ ...plan, newComments: 1, sinceSummary: { finishedTurns: 0, messages: 10 }, capabilities: { canPost: true, canAsk: true, canAskForCode: true, canSteer: false, canEdit: false, canDelete: false } })
    ).toEqual(['Revise the plan with 1 comment', 'Summarise so far', 'Build it'])
    expect(suggestTaskActions(input({ ...plan, sinceSummary: { finishedTurns: 5, messages: 0 } }))).toContainEqual({ action: 'summarise', label: 'Summarise so far' })
  })

  it('offers no summary while the agent works', () => {
    expect(labels({ agentWorking: true, sinceSummary: { finishedTurns: 9, messages: 30 } })).toEqual([])
  })
})

describe('buildSuggestions', () => {
  const part = (number: number, status: TaskPlanPartStatus) => ({ number, title: `Part ${number}`, status, pullRequestUrl: null })
  const plan = (statuses: TaskPlanPartStatus[], open: PartRange | null = null): TaskPlanParts => {
    const parts = statuses.map((status, index) => part(index + 1, status))
    return { parts, open, addable: null, next: open ? null : (parts.find((entry) => entry.status === 'not_built')?.number ?? null) }
  }

  it('builds a plan in one part, or none, as a whole', () => {
    expect(buildSuggestions(null)).toEqual([{ action: 'code', label: 'Build it' }])
    expect(buildSuggestions(plan(['not_built']))).toEqual([{ action: 'code', label: 'Build it' }])
  })

  it('offers the first part on its own, or the whole plan in one pull request', () => {
    expect(buildSuggestions(plan(['not_built', 'not_built', 'not_built']))).toEqual([
      { action: 'code', label: 'Build part 1', parts: { first: 1, last: 1 } },
      { action: 'code', label: 'Build it', parts: { first: 1, last: null } },
    ])
  })

  it('offers the next part, or the rest, once the earlier parts are merged', () => {
    expect(buildSuggestions(plan(['merged', 'not_built', 'not_built'])).map((suggestion) => suggestion.label)).toEqual(['Build part 2', 'Build the rest'])
    expect(buildSuggestions(plan(['merged', 'merged', 'not_built'])).map((suggestion) => suggestion.label)).toEqual(['Build part 3'])
  })

  it('offers no new part while a part’s pull request is open, or once every part is built', () => {
    expect(buildSuggestions(plan(['open', 'not_built'], { first: 1, last: 1 }))).toEqual([])
    expect(buildSuggestions(plan(['merged', 'merged']))).toEqual([])
  })
})
