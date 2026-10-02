import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TaskTimelineEntry } from '@viberglass/types'
import { contextLine } from './agent-turn-entry'
import { bringInMessage } from './bring-in-agent'
import { TaskThread } from './task-thread'
import { summaryFacts } from './thread-summaries'

const CLAUDE = '33333333-3333-4333-8333-333333333333'
const CODEX = '44444444-4444-4444-8444-444444444444'
const mockTimeline = jest.fn()
const mockPost = jest.fn()

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me', role: 'member' } }) }))
jest.mock('@/service/api/discussion-api', () => ({
  getTaskTimeline: (...args: unknown[]) => mockTimeline(...args),
  postTaskMessage: (...args: unknown[]) => mockPost(...args),
  askAgent: jest.fn(),
}))
jest.mock('@/service/api/home-api', () => ({ markTaskRead: jest.fn().mockResolvedValue(undefined) }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/hooks/usePeople', () => ({ usePersonName: () => () => null }))
jest.mock('@/service/api/user-api', () => ({ getPeopleDirectory: jest.fn().mockResolvedValue([]) }))

const summaryTurn: TaskTimelineEntry = {
  kind: 'agent_turn',
  id: 'turn-sum',
  at: '2026-10-02T09:00:00Z',
  agent: { id: CLAUDE, name: 'Claude' },
  action: 'summarise',
  status: 'completed',
  outcome: {
    intent: 'Summarising the conversation',
    reply: 'Summarising the conversation',
    produced: ['summary'],
    codeDiscarded: false,
    resumed: true,
    compacted: true,
    contextUsage: { used: 150_000, size: 200_000 },
  },
  sessionId: 's-1',
  jobId: 'job-1',
}

const summary = (version: number, at: string, content: string): TaskTimelineEntry => ({ kind: 'summary', id: `sum-${version}`, at, version, content })
const message = (id: string, at: string): TaskTimelineEntry => ({ kind: 'message', id, at, author: { id: 'u', name: 'Maria' }, body: 'Hi', channel: 'thread', sessionId: null })

function renderThread(entries: TaskTimelineEntry[], runnable = [{ id: CLAUDE, name: 'Claude' }, { id: CODEX, name: 'Codex' }]) {
  mockTimeline.mockResolvedValue(entries)
  const onAsked = jest.fn()
  render(
    <Theme>
      <MemoryRouter>
        <TaskThread
          taskId="t-1"
          project="web"
          refreshKey="1"
          onOpenArtifact={jest.fn()}
          agents={[]}
          suggestionInput={{
            ticket: { status: 'open' },
            documents: { research: { content: '# R' }, planning: { content: '# P' } },
            capabilities: { canPost: true, canAsk: true, canAskForCode: false, canEdit: false, canDelete: false },
            newComments: { research: 0, planning: 0 },
            agentWorking: false,
          }}
          canPost
          canAsk
          runnableAgents={runnable}
          onAsked={onAsked}
        />
      </MemoryRouter>
    </Theme>
  )
  return { onAsked }
}

describe('summaries in the thread', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pins the latest summary above the thread and shows each version in it', async () => {
    renderThread([summary(1, '2026-10-01T09:00:00Z', 'Old decisions'), summaryTurn, summary(2, '2026-10-02T09:01:00Z', '## Decisions\n\n- Gift notes are free')])

    const pinned = await screen.findByRole('region', { name: 'Summary so far' })
    expect(within(pinned).getByText('Gift notes are free')).toBeInTheDocument()
    expect(within(pinned).getByText(/v2/)).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Summary v1' })).toHaveTextContent('Old decisions')
    expect(screen.getByRole('listitem', { name: 'Summary v2' })).toBeInTheDocument()

    fireEvent.click(within(pinned).getByRole('button', { name: 'Hide' }))
    expect(within(pinned).queryByText('Gift notes are free')).not.toBeInTheDocument()
  })

  it('says the agent wrote the summary, compacted its context, and how full that was', async () => {
    renderThread([summaryTurn, summary(1, '2026-10-02T09:01:00Z', 'Decisions')])
    const turn = await screen.findByRole('listitem', { name: "Claude's turn" })
    expect(turn).toHaveTextContent('Wrote Summary v1')
    expect(turn).toHaveTextContent('Compacted its context with the summary')
    expect(turn).toHaveTextContent('Context 75% full')
  })
})

describe('bringing in another agent', () => {
  beforeEach(() => jest.clearAllMocks())

  it('offers the agents not on the task, and asks the chosen one with a message that says it starts fresh', async () => {
    mockPost.mockResolvedValue({ messages: [], turn: { jobId: 'job-2' } })
    const { onAsked } = renderThread([summaryTurn])

    fireEvent.keyDown(await screen.findByRole('button', { name: 'Bring in another agent' }), { key: 'Enter' })
    expect(screen.queryByRole('menuitem', { name: 'Claude' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Codex' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('t-1', bringInMessage('Codex'), { agentId: CODEX }))
    expect(bringInMessage('Codex')).toBe('Bring in Codex: it starts fresh and reads the summary and the task')
    await waitFor(() => expect(onAsked).toHaveBeenCalled())
  })

  it("isn't offered when every agent is already on the task", async () => {
    renderThread([summaryTurn], [{ id: CLAUDE, name: 'Claude' }])
    await screen.findByRole('listitem', { name: "Claude's turn" })
    expect(screen.queryByRole('button', { name: 'Bring in another agent' })).not.toBeInTheDocument()
  })
})

describe('summaryFacts and contextLine', () => {
  it('counts what happened since the latest summary', () => {
    const facts = summaryFacts([message('m-1', '1'), summary(1, '2', 'S'), message('m-2', '3'), summaryTurn])
    expect(facts.latest?.version).toBe(1)
    expect(facts.sinceLatest).toEqual({ finishedTurns: 1, messages: 1 })
  })

  it('reads tokens when the harness gave no size', () => {
    expect(contextLine({ used: 150_000, size: null })).toBe('150k tokens in context')
    expect(contextLine(null)).toBeNull()
  })
})
