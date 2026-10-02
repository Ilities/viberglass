import { countNewComments, suggestTaskActions, type TaskSuggestionInput } from './task-suggestions'

const doc = (content: string) => ({ content })

function input(overrides: Partial<TaskSuggestionInput> = {}): TaskSuggestionInput {
  return {
    ticket: { status: 'open' },
    documents: { research: doc(''), planning: doc('') },
    capabilities: { canPost: true, canAsk: true, canAskForCode: false, canEdit: false, canDelete: false },
    newComments: { research: 0, planning: 0 },
    latestTurn: null,
    agentWorking: false,
    ...overrides,
  }
}

const labels = (overrides: Partial<TaskSuggestionInput>) => suggestTaskActions(input(overrides)).map((suggestion) => suggestion.label)

describe('suggestTaskActions', () => {
  it('starts a new task with the research, or straight with the plan', () => {
    expect(suggestTaskActions(input())).toEqual([
      { action: 'research', label: 'Write the research' },
      { action: 'plan', label: 'Write the plan' },
    ])
  })

  it('offers to revise a document with its open comments, then what comes next', () => {
    expect(labels({ documents: { research: doc('# R'), planning: doc('') }, newComments: { research: 2, planning: 0 } })).toEqual([
      'Revise the research with 2 comments',
      'Write the plan',
    ])
    expect(labels({ documents: { research: doc('# R'), planning: doc('# P') }, newComments: { research: 0, planning: 1 } })).toEqual([
      'Revise the plan with 1 comment',
    ])
  })

  it('offers the build last to whoever may ask for code, with or without a plan', () => {
    const coder = { canPost: true, canAsk: true, canAskForCode: true, canEdit: false, canDelete: false }
    expect(labels({ capabilities: coder, documents: { research: doc(''), planning: doc('# P') } })).toEqual(['Build it'])
    expect(labels({ capabilities: coder })).toEqual(['Write the research', 'Write the plan', 'Build it'])
    expect(labels({ documents: { research: doc(''), planning: doc('# P') } })).toEqual([])
  })

  it('offers nothing to someone who may not ask, and no build retry to someone who may not ask for code', () => {
    expect(labels({ capabilities: { canPost: true, canAsk: false, canAskForCode: false, canEdit: false, canDelete: false } })).toEqual([])
    expect(labels({ capabilities: null })).toEqual([])
    expect(labels({ latestTurn: { action: 'code', status: 'failed' } })).not.toContain('Try again')
  })

  it('offers to try a failed turn again first, asking for the same thing', () => {
    expect(suggestTaskActions(input({ latestTurn: { action: 'plan', status: 'failed' } }))[0]).toEqual({ action: 'plan', label: 'Try again' })
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

  it('offers a summary once the thread has grown, after the documents and before the build', () => {
    const plan = { documents: { research: doc('# R'), planning: doc('# P') } }
    expect(labels({ ...plan, sinceSummary: { finishedTurns: 2, messages: 9 } })).toEqual([])
    expect(labels({ ...plan, sinceSummary: { finishedTurns: 3, messages: 0 } })).toEqual(['Summarise so far'])
    expect(
      labels({ ...plan, newComments: { research: 0, planning: 1 }, sinceSummary: { finishedTurns: 0, messages: 10 }, capabilities: { canPost: true, canAsk: true, canAskForCode: true, canEdit: false, canDelete: false } })
    ).toEqual(['Revise the plan with 1 comment', 'Summarise so far', 'Build it'])
    expect(suggestTaskActions(input({ ...plan, sinceSummary: { finishedTurns: 5, messages: 0 } }))).toContainEqual({ action: 'summarise', label: 'Summarise so far' })
  })

  it('offers no summary while the agent works', () => {
    expect(labels({ agentWorking: true, sinceSummary: { finishedTurns: 9, messages: 30 } })).toEqual([])
  })
})
