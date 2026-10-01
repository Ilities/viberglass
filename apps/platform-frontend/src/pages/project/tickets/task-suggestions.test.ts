import { countNewComments, suggestTaskActions, type TaskSuggestionInput } from './task-suggestions'

const doc = (content: string, approvalState: 'draft' | 'approval_requested' | 'approved' = 'approval_requested') => ({ content, approvalState })

function input(overrides: Partial<TaskSuggestionInput> = {}): TaskSuggestionInput {
  return {
    ticket: { status: 'open', workflowOverriddenAt: undefined },
    documents: { research: doc(''), planning: doc('') },
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

  it('offers the build once the plan is approved, or the task skipped to it', () => {
    expect(labels({ documents: { research: doc(''), planning: doc('# P', 'approved') } })).toEqual(['Build it'])
    expect(labels({ ticket: { status: 'open', workflowOverriddenAt: '2026-10-01T00:00:00Z' }, documents: { research: doc(''), planning: doc('# P') } })).toEqual([
      'Build it',
    ])
  })

  it('offers to try a failed turn again first, asking for the same thing', () => {
    expect(suggestTaskActions(input({ latestTurn: { action: 'plan', status: 'failed' } }))[0]).toEqual({ action: 'plan', label: 'Try again' })
  })

  it('offers nothing while the agent works, or once the task is done', () => {
    expect(labels({ agentWorking: true })).toEqual([])
    expect(labels({ ticket: { status: 'resolved', workflowOverriddenAt: undefined } })).toEqual([])
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
})
