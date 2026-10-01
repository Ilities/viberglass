import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { mentionToken, parseMentionedUserIds, splitMentions, type TaskActivityEntry, type TaskTimelineEntry } from '@viberglass/types'
import { describeActivity } from './activity-sentence'
import { TaskThread } from './task-thread'

const DANA = '22222222-2222-4222-8222-222222222222'
const mockPost = jest.fn()

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me', role: 'member' } }) }))
const mockTimeline = jest.fn()
jest.mock('@/service/api/discussion-api', () => ({
  getTaskTimeline: (...args: unknown[]) => mockTimeline(...args),
  postTaskMessage: (...args: unknown[]) => mockPost(...args),
}))
jest.mock('@/hooks/usePeople', () => ({ usePersonName: () => () => null }))
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

const MARIA = { id: 'u-1', name: 'Maria' }

const THREAD: TaskTimelineEntry[] = [
  {
    kind: 'event',
    id: 'e-1',
    at: '2026-10-01T10:00:00Z',
    activity: { id: 'e-1', ticketId: 't-1', actorType: 'human', actor: MARIA, kind: 'task_created', payload: {}, createdAt: '2026-10-01T10:00:00Z' },
  },
  { kind: 'artifact_version', id: 'v-1', at: '2026-10-01T10:05:00Z', artifact: 'research', version: 1, author: null, byAgent: true },
  { kind: 'message', id: 'm-1', at: '2026-10-01T10:06:00Z', author: MARIA, body: 'Looks right to me', channel: 'thread', sessionId: null },
  { kind: 'message', id: 'm-2', at: '2026-10-01T10:07:00Z', author: MARIA, body: 'Check the checkout too', channel: 'session', sessionId: 's-1' },
]

function renderThread(onOpenArtifact = jest.fn()) {
  render(
    <Theme>
      <MemoryRouter>
        <TaskThread taskId="t-1" project="web" refreshKey="1" onOpenArtifact={onOpenArtifact} />
      </MemoryRouter>
    </Theme>
  )
  return onOpenArtifact
}

describe('TaskThread', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTimeline.mockResolvedValue(THREAD)
  })

  it('shows messages, document versions and events in one thread', async () => {
    renderThread()
    expect(await screen.findByText('Maria created the task')).toBeInTheDocument()
    expect(screen.getByText('Research v1')).toBeInTheDocument()
    expect(screen.getByText('Looks right to me')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'live session' })).toHaveAttribute('href', '/spaces/web/sessions/s-1')
  })

  it('hides events when only messages are wanted', async () => {
    renderThread()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Messages only' }))
    expect(screen.queryByText('Maria created the task')).not.toBeInTheDocument()
    expect(screen.getByText('Research v1')).toBeInTheDocument()
  })

  it("opens a version's document", async () => {
    const onOpen = renderThread()
    fireEvent.click(await screen.findByRole('button', { name: 'Open Research v1' }))
    expect(onOpen).toHaveBeenCalledWith('research')
  })

  it('suggests people after @, sends a mention the server can read, and reloads the thread', async () => {
    mockTimeline.mockResolvedValue([])
    mockPost.mockResolvedValue([])
    renderThread()

    const box = await screen.findByRole('textbox', { name: 'Write a message' })
    fireEvent.change(box, { target: { value: 'Can you look, @da' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Dana' }))
    expect(box).toHaveValue('Can you look, @Dana ')
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('t-1', `Can you look, ${mentionToken('Dana', DANA)} `))
    await waitFor(() => expect(mockTimeline).toHaveBeenCalledTimes(2))
  })
})
