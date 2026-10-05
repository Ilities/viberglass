import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  agentMentionToken,
  mentionToken,
  mentionsAnAgent,
  parseMentionedAgentIds,
  parseMentionedUserIds,
  splitMentions,
  withPlainMentions,
  type TaskActivityEntry,
  type TaskTimelineEntry,
} from '@viberglass/types'
import { describeActivity } from './activity-sentence'
import { TaskThread } from './task-thread'

const DANA = '22222222-2222-4222-8222-222222222222'
const CLAUDE = '33333333-3333-4333-8333-333333333333'
const mockPost = jest.fn()
const mockAsk = jest.fn()
const mockAnswer = jest.fn()
const mockInterrupt = jest.fn()
const mockPause = jest.fn()
const mockResume = jest.fn()
const mockBranch = jest.fn()
const mockTakeOver = jest.fn()
const mockHandBack = jest.fn()

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me', role: 'member' } }) }))
const mockTimeline = jest.fn()
jest.mock('@/service/api/discussion-api', () => ({
  getTaskTimeline: (...args: unknown[]) => mockTimeline(...args),
  getNextAgent: () => Promise.resolve({ clankerId: null, name: null, via: null, problem: null }),
  postTaskMessage: (...args: unknown[]) => mockPost(...args),
  askAgent: (...args: unknown[]) => mockAsk(...args),
  answerQuestion: (...args: unknown[]) => mockAnswer(...args),
  interruptAgent: (...args: unknown[]) => mockInterrupt(...args),
  pauseAgent: (...args: unknown[]) => mockPause(...args),
  resumeAgent: (...args: unknown[]) => mockResume(...args),
  getTaskBranch: (...args: unknown[]) => mockBranch(...args),
  takeOverTask: (...args: unknown[]) => mockTakeOver(...args),
  handBackTask: (...args: unknown[]) => mockHandBack(...args),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
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
    expect(splitMentions(body)[1]).toEqual({ mention: { name: 'Dana', kind: 'user', id: DANA } })
  })

  it('tells people and agents apart, and reads "@agent" as asking the agent', () => {
    const body = `${agentMentionToken('Claude', CLAUDE)} and ${mentionToken('Dana', DANA)}, have a look`
    expect(parseMentionedAgentIds(body)).toEqual([CLAUDE])
    expect(parseMentionedUserIds(body)).toEqual([DANA])
    expect(withPlainMentions(body)).toBe('@Claude and @Dana, have a look')
    expect(mentionsAnAgent(body)).toBe(true)
    expect(mentionsAnAgent('@agent revise the plan')).toBe(true)
    expect(mentionsAnAgent(`Thanks ${mentionToken('Dana', DANA)}, mail me at x@agentur.fi`)).toBe(false)
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
    const merged = { kind: 'pull_request_merged' as const, actorType: 'system' as const, actor: null }
    expect(describeActivity(entry({ ...merged, payload: { mergedBy: 'dev-koskinen' } }), nameOf)).toBe('Merged by dev-koskinen')
    expect(describeActivity(entry({ ...merged, payload: {} }), nameOf)).toBe('The pull request was merged')
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

const SUGGESTION_INPUT = {
  ticket: { status: 'open' as const },
  documents: { research: { content: '# Research' }, planning: { content: '' } },
  capabilities: { canPost: true, canAsk: true, canAskForCode: false, canSteer: false, canEdit: false, canDelete: false },
  newComments: { research: 1, planning: 0 },
  agentWorking: false,
}

function renderThread(
  onOpenArtifact = jest.fn(),
  onAsked = jest.fn(),
  rights: { canPost: boolean; canAsk: boolean; canSteer?: boolean; paused?: boolean } = { canPost: true, canAsk: true }
) {
  render(
    <Theme>
      <MemoryRouter>
        <TaskThread
          taskId="t-1"
          refreshKey="1"
          onOpenArtifact={onOpenArtifact}
          agents={[{ kind: 'agent', id: CLAUDE, name: 'Claude' }]}
          suggestionInput={SUGGESTION_INPUT}
          canPost={rights.canPost}
          canAsk={rights.canAsk}
          canSteer={rights.canSteer}
          paused={rights.paused}
          runnableAgents={[{ id: CLAUDE, name: 'Claude' }]}
          onAsked={onAsked}
        />
      </MemoryRouter>
    </Theme>
  )
  return { onOpenArtifact, onAsked }
}

function agentTurn(overrides: Partial<Extract<TaskTimelineEntry, { kind: 'agent_turn' }>> = {}): TaskTimelineEntry {
  return {
    kind: 'agent_turn',
    id: 'turn-1',
    at: '2026-10-01T10:08:00Z',
    agent: { id: CLAUDE, name: 'Claude' },
    action: 'research',
    status: 'completed',
    outcome: {
      intent: 'Revising the research: covering the checkout',
      reply: 'Revising the research: covering the checkout\n\nI added a section on the checkout flow.',
      produced: ['research'],
      codeDiscarded: false,
      resumed: true,
    },
    sessionId: 's-1',
    jobId: 'job-1',
    ...overrides,
  }
}

describe('TaskThread', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTimeline.mockResolvedValue(THREAD)
    mockBranch.mockResolvedValue(null)
  })

  it('shows messages, document versions and events in one thread', async () => {
    renderThread()
    expect(await screen.findByText('Maria created the task')).toBeInTheDocument()
    expect(screen.getByText('Research v1')).toBeInTheDocument()
    expect(screen.getByText('Looks right to me')).toBeInTheDocument()
    expect(screen.getByText(/to the agent/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /session/ })).not.toBeInTheDocument()
  })

  it('gives someone who may not post (a viewer) no composer and no actions', async () => {
    mockTimeline.mockResolvedValue([])
    renderThread(jest.fn(), jest.fn(), { canPost: false, canAsk: false })

    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Suggested actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bring in/ })).not.toBeInTheDocument()
  })

  it('hides events when only messages are wanted', async () => {
    renderThread()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Messages only' }))
    expect(screen.queryByText('Maria created the task')).not.toBeInTheDocument()
    expect(screen.getByText('Research v1')).toBeInTheDocument()
  })

  it("opens the latest version as the current document, and an earlier one at its own version", async () => {
    mockTimeline.mockResolvedValue([
      ...THREAD,
      { kind: 'artifact_version', id: 'v-2', at: '2026-10-01T10:08:00Z', artifact: 'research', version: 2, author: null, byAgent: true },
    ])
    const { onOpenArtifact } = renderThread()
    fireEvent.click(await screen.findByRole('button', { name: 'Open Research v2' }))
    expect(onOpenArtifact).toHaveBeenLastCalledWith('research', null)
    fireEvent.click(screen.getByRole('button', { name: 'Open Research v1' }))
    expect(onOpenArtifact).toHaveBeenLastCalledWith('research', 1)
  })

  it("shows the agent's turn: what it set out to do, what it made, and whether it continued its session; what it said is a click away", async () => {
    mockTimeline.mockResolvedValue([agentTurn()])
    renderThread()

    const turn = await screen.findByRole('listitem', { name: "Claude's turn" })
    expect(turn).toHaveTextContent('asked for the research')
    expect(turn).toHaveTextContent('Turn details · resumed session')
    expect(turn).toHaveTextContent('Revising the research: covering the checkout')
    expect(turn).toHaveTextContent('Wrote the research.')
    expect(turn).not.toHaveTextContent('I added a section on the checkout flow.')
    fireEvent.click(within(turn).getByRole('button', { name: 'Show what it said' }))
    expect(turn).toHaveTextContent('I added a section on the checkout flow.')
  })

  it('names the people the agent asked to look at what it produced', async () => {
    const turn = agentTurn()
    if (turn.kind !== 'agent_turn' || !turn.outcome) throw new Error('expected a finished agent turn')
    mockTimeline.mockResolvedValue([{ ...turn, outcome: { ...turn.outcome, mentioned: [{ id: 'u-t', name: 'Tomi' }, { id: 'u-a', name: 'Aino' }] } }])
    renderThread()

    expect(await screen.findByRole('listitem', { name: "Claude's turn" })).toHaveTextContent('Asked Tomi and Aino to take a look')
  })

  it('says a turn is working, or failed, with the way to its run', async () => {
    mockTimeline.mockResolvedValue([agentTurn({ id: 'a', status: 'failed', outcome: null }), agentTurn({ id: 'b', status: 'running', outcome: null })])
    renderThread()

    expect(await screen.findByText('Working on it…')).toBeInTheDocument()
    expect(screen.getByText('This turn failed.')).toBeInTheDocument()
    // The run opens beside the thread on the same page, rather than on a page that sends you back here.
    expect(screen.getByRole('link', { name: 'See what happened' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^[^?]*\?run=job-1$/)
    )
    expect(screen.getByRole('link', { name: 'See what happened' }).getAttribute('href')).not.toContain('/runs/')
    // While it works, nothing new is suggested.
    expect(screen.queryByRole('group', { name: 'Suggested actions' })).not.toBeInTheDocument()
  })

  it('offers the next moves, and asks the agent as you', async () => {
    mockTimeline.mockResolvedValue([])
    mockAsk.mockResolvedValue({ sessionId: 's-1', turnId: 't-1', jobId: 'job-1', status: 'pending' })
    const { onAsked } = renderThread()

    const actions = await screen.findByRole('group', { name: 'Suggested actions' })
    expect(Array.from(actions.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      'Revise the research with 1 comment',
      'Write the plan',
      // On the same row, so every way to ask the agent lines up.
      'Bring in another agent',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Revise the research with 1 comment' }))

    await waitFor(() => expect(mockAsk).toHaveBeenCalledWith('t-1', { action: 'research', body: 'Revise the research with 1 comment' }))
    await waitFor(() => expect(onAsked).toHaveBeenCalled())
  })

  it('suggests the agent after @, and sends a mention that asks it', async () => {
    mockTimeline.mockResolvedValue([])
    mockPost.mockResolvedValue({ messages: [], turn: { sessionId: 's-1', turnId: 't-1', jobId: 'job-1', status: 'pending' } })
    renderThread()

    const box = await screen.findByRole('combobox', { name: 'Write a message' })
    fireEvent.change(box, { target: { value: '@ag' } })
    fireEvent.click(await screen.findByRole('option', { name: /Claude/ }))
    fireEvent.change(box, { target: { value: '@Claude cover Safari too' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('t-1', `${agentMentionToken('Claude', CLAUDE)} cover Safari too`))
  })

  it('suggests people after @, sends a mention the server can read, and reloads the thread', async () => {
    mockTimeline.mockResolvedValue([])
    mockPost.mockResolvedValue({ messages: [], turn: null })
    renderThread()

    const box = await screen.findByRole('combobox', { name: 'Write a message' })
    fireEvent.change(box, { target: { value: 'Can you look, @da' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Dana' }))
    expect(box).toHaveValue('Can you look, @Dana ')
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('t-1', `Can you look, ${mentionToken('Dana', DANA)} `))
    await waitFor(() => expect(mockTimeline).toHaveBeenCalledTimes(2))
  })

  it('picks a mention with the keyboard the same as with a pointer, and keeps Enter for new lines otherwise', async () => {
    mockTimeline.mockResolvedValue([])
    mockPost.mockResolvedValue({ messages: [], turn: null })
    renderThread()

    const box = await screen.findByRole('combobox', { name: 'Write a message' })
    fireEvent.change(box, { target: { value: 'Can you look, @' } })
    await screen.findAllByRole('option')
    const options = screen.getAllByRole('option')
    const dana = options.findIndex((option) => option.textContent === 'Dana')
    for (let step = 0; step < dana; step++) fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(box).toHaveAttribute('aria-activedescendant', options[dana].id)
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box).toHaveValue('Can you look, @Dana ')
    expect(box).toHaveAttribute('aria-expanded', 'false')

    fireEvent.change(box, { target: { value: 'Can you look, @Dana and @da' } })
    expect(await screen.findByRole('option', { name: 'Dana' })).toBeInTheDocument()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(fireEvent.keyDown(box, { key: 'Enter' })).toBe(true)

    fireEvent.change(box, { target: { value: 'Can you look, @Dana ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('t-1', `Can you look, ${mentionToken('Dana', DANA)} `))
  })

  it("shows a reviewer's comment itself beside a short quote, with whether it's resolved", async () => {
    const commented = (id: string, comment: string): TaskTimelineEntry => ({
      kind: 'event',
      id,
      at: '2026-10-01T10:09:00Z',
      activity: {
        id,
        ticketId: 't-1',
        actorType: 'human',
        actor: { id: 'q', name: 'Quinn' },
        kind: 'comment_added',
        payload: { step: 'research', quote: '`greeting.js` exports **greeting**', commentId: `c-${id}`, comment },
        createdAt: '2026-10-01T10:09:00Z',
      },
    })
    const resolved: TaskTimelineEntry = {
      kind: 'event',
      id: 'r',
      at: '2026-10-01T10:10:00Z',
      activity: {
        id: 'r',
        ticketId: 't-1',
        actorType: 'human',
        actor: MARIA,
        kind: 'comment_status_changed',
        payload: { step: 'research', commentId: 'c-1', status: 'resolved' },
        createdAt: '2026-10-01T10:10:00Z',
      },
    }
    mockTimeline.mockResolvedValue([commented('1', 'Add a regression test.'), commented('2', 'Keep it short.'), resolved])
    const onOpenComments = jest.fn()
    render(
      <Theme>
        <MemoryRouter>
          <TaskThread
            taskId="t-1"
            refreshKey="1"
            onOpenArtifact={jest.fn()}
            onOpenComments={onOpenComments}
            agents={[]}
            suggestionInput={SUGGESTION_INPUT}
            canPost={false}
            canAsk={false}
            runnableAgents={[]}
            onAsked={jest.fn()}
          />
        </MemoryRouter>
      </Theme>
    )

    const [first] = await screen.findAllByRole('listitem', { name: "Quinn's comment" })
    expect(first).toHaveTextContent('Add a regression test.')
    expect(first).toHaveTextContent('greeting.js exports greeting')
    expect(screen.getAllByText('Resolved')).toHaveLength(1)
    expect(screen.getAllByText('Open')[0]).toBeInTheDocument()
    expect(screen.queryByText(/resolved a comment/)).not.toBeInTheDocument()
    fireEvent.click(within(first).getByRole('button', { name: 'Open in comments' }))
    expect(onOpenComments).toHaveBeenCalledWith('research')
  })
})
