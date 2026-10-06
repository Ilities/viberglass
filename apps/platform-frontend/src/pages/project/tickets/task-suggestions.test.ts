import { countNewComments, suggestTaskActions, type TaskSuggestionInput } from './task-suggestions'

const doc = (content: string) => ({ content })

function input(overrides: Partial<TaskSuggestionInput> = {}): TaskSuggestionInput {
  return {
    ticket: { status: 'open' },
    documents: { planning: doc('') },
    capabilities: { canPost: true, canAsk: true, canAskForCode: false, canSteer: false, canEdit: false, canDelete: false },
    newComments: { planning: 0 },
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
    expect(labels({ documents: { planning: doc('# P') }, newComments: { planning: 1 } })).toEqual(['Revise the plan with 1 comment'])
    expect(labels({ documents: { planning: doc('# P') }, newComments: { planning: 2 } })).toEqual(['Revise the plan with 2 comments'])
  })

  it('offers the build last to whoever may ask for code, with or without a plan', () => {
    const coder = { canPost: true, canAsk: true, canAskForCode: true, canSteer: false, canEdit: false, canDelete: false }
    expect(labels({ capabilities: coder, documents: { planning: doc('# P') } })).toEqual(['Build it'])
    expect(labels({ capabilities: coder })).toEqual(['Write the plan', 'Build it'])
    expect(labels({ documents: { planning: doc('# P') } })).toEqual([])
  })

  it('offers nothing to someone who may not ask, and no build retry to someone who may not ask for code', () => {
    expect(labels({ capabilities: { canPost: true, canAsk: false, canAskForCode: false, canSteer: false, canEdit: false, canDelete: false } })).toEqual([])
    expect(labels({ capabilities: null })).toEqual([])
    expect(labels({ latestTurn: { action: 'code', status: 'failed' } })).not.toContain('Try again')
  })

  it('offers to try a failed turn again first, asking for the same thing', () => {
    expect(suggestTaskActions(input({ latestTurn: { action: 'plan', status: 'failed' } }))[0]).toEqual({ action: 'plan', label: 'Try again' })
  })

  it('tries again with the agent whose turn failed', () => {
    const latestTurn = { action: 'plan' as const, status: 'failed', agent: { id: 'qwen', name: 'Qwen' } }
    expect(suggestTaskActions(input({ latestTurn }))[0]).toEqual({ action: 'plan', label: 'Try again with Qwen', agentId: 'qwen' })
  })

  it("doesn't offer to try again when the setup has to be fixed first", () => {
    const failed = { latestTurn: { action: 'plan' as const, status: 'failed' } }
    expect(labels({ ...failed, lastFailure: { category: 'setup', retryable: false } })).not.toContain('Try again')
    expect(labels({ ...failed, lastFailure: { category: 'setup', retryable: true } })).toContain('Try again')
    expect(labels({ ...failed, lastFailure: { category: 'agent', retryable: true } })).toContain('Try again')
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
    const plan = { documents: { planning: doc('# P') } }
    expect(labels({ ...plan, sinceSummary: { finishedTurns: 2, messages: 9 } })).toEqual([])
    expect(labels({ ...plan, sinceSummary: { finishedTurns: 3, messages: 0 } })).toEqual(['Summarise so far'])
    expect(
      labels({ ...plan, newComments: { planning: 1 }, sinceSummary: { finishedTurns: 0, messages: 10 }, capabilities: { canPost: true, canAsk: true, canAskForCode: true, canSteer: false, canEdit: false, canDelete: false } })
    ).toEqual(['Revise the plan with 1 comment', 'Summarise so far', 'Build it'])
    expect(suggestTaskActions(input({ ...plan, sinceSummary: { finishedTurns: 5, messages: 0 } }))).toContainEqual({ action: 'summarise', label: 'Summarise so far' })
  })

  it('offers no summary while the agent works', () => {
    expect(labels({ agentWorking: true, sinceSummary: { finishedTurns: 9, messages: 30 } })).toEqual([])
  })
})
