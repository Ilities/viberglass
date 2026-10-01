import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { mentionToken, parseMentionedUserIds, splitMentions, type TaskActivityEntry } from '@viberglass/types'
import { describeActivity } from './activity-sentence'
import { TaskDiscussion } from './task-discussion'

const DANA = '22222222-2222-4222-8222-222222222222'
const mockPost = jest.fn()

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me', role: 'member' } }) }))
jest.mock('@/service/api/discussion-api', () => ({
  getTaskMessages: jest.fn().mockResolvedValue([]),
  postTaskMessage: (...args: unknown[]) => mockPost(...args),
}))
jest.mock('@/service/api/user-api', () => ({
  getPeopleDirectory: jest.fn().mockResolvedValue([
    { id: '22222222-2222-4222-8222-222222222222', name: 'Dana', email: 'dana@example.com', avatarUrl: null },
    { id: 'me', name: 'Me', email: 'me@example.com', avatarUrl: null },
  ]),
}))

describe('mentions', () => {
  it('round-trips a mention through the message body', () => {
    const body = `Hi ${mentionToken('Dana', DANA)}, and again ${mentionToken('Dana', DANA)}`
    expect(parseMentionedUserIds(body)).toEqual([DANA])
    expect(splitMentions(body)[1]).toEqual({ mention: { name: 'Dana', userId: DANA } })
  })
})

describe('describeActivity', () => {
  const entry = (overrides: Partial<TaskActivityEntry>): TaskActivityEntry => ({
    id: 'a-1',
    ticketId: 't-1',
    actorType: 'human',
    actor: { id: 'u-1', name: 'Maria' },
    kind: 'task_created',
    payload: {},
    createdAt: '2026-09-30T10:00:00Z',
    ...overrides,
  })

  it('says who did what, in plain words', () => {
    const nameOf = (id: string) => (id === DANA ? 'Dana' : 'someone')
    expect(describeActivity(entry({ kind: 'owner_changed', payload: { userId: DANA } }), nameOf)).toBe('Maria made Dana the owner')
    expect(describeActivity(entry({ kind: 'document_approved', payload: { step: 'planning' } }), nameOf)).toBe('Maria approved the plan')
    expect(
      describeActivity(entry({ kind: 'run_failed', actorType: 'agent', actor: null, payload: { step: 'research', reason: 'Credential expired' } }), nameOf)
    ).toBe('The research run failed: Credential expired')
    expect(describeActivity(entry({ kind: 'message_posted', payload: { mentioned: [DANA] } }), nameOf)).toBe(
      'Maria wrote in the discussion and mentioned Dana'
    )
  })
})

describe('TaskDiscussion', () => {
  it('suggests people after @ and sends a mention the server can read', async () => {
    mockPost.mockResolvedValue([])
    render(
      <Theme>
        <TaskDiscussion taskId="t-1" />
      </Theme>
    )

    const box = await screen.findByRole('textbox', { name: 'Write a message' })
    fireEvent.change(box, { target: { value: 'Can you look, @da' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Dana' }))
    expect(box).toHaveValue('Can you look, @Dana ')
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('t-1', `Can you look, ${mentionToken('Dana', DANA)} `))
  })
})
