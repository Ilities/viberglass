import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Clanker, TaskTimelineEntry } from '@viberglass/types'
import { TaskThread } from './task-thread'

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
const mockRetryAll = jest.fn()
const mockMentionDone = jest.fn()

let mockRole = 'member'
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me', role: mockRole } }) }))
const mockTimeline = jest.fn()
const mockNextAgent = jest.fn()
const mockResumeTarget = jest.fn()
jest.mock('@/service/api/discussion-api', () => ({
  getTaskTimeline: (...args: unknown[]) => mockTimeline(...args),
  getNextAgent: (...args: unknown[]) => mockNextAgent(...args),
  getResumeTarget: (...args: unknown[]) => mockResumeTarget(...args),
  postTaskMessage: (...args: unknown[]) => mockPost(...args),
  askAgent: (...args: unknown[]) => mockAsk(...args),
  answerQuestion: (...args: unknown[]) => mockAnswer(...args),
  interruptAgent: (...args: unknown[]) => mockInterrupt(...args),
  pauseAgent: (...args: unknown[]) => mockPause(...args),
  resumeAgent: (...args: unknown[]) => mockResume(...args),
  getTaskBranch: (...args: unknown[]) => mockBranch(...args),
  takeOverTask: (...args: unknown[]) => mockTakeOver(...args),
  handBackTask: (...args: unknown[]) => mockHandBack(...args),
  retryPausedRuns: (...args: unknown[]) => mockRetryAll(...args),
  markMentionsDone: (...args: unknown[]) => mockMentionDone(...args),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/hooks/usePeople', () => ({ usePersonName: () => () => null }))
jest.mock('@/service/api/user-api', () => ({
  getPeopleDirectory: jest.fn().mockResolvedValue([
    { id: '22222222-2222-4222-8222-222222222222', name: 'Dana', email: 'dana@example.com', avatarUrl: null },
    { id: 'me', name: 'Me', email: 'me@example.com', avatarUrl: null },
  ]),
}))

const CLAUDE_RUNNER: Clanker = {
  id: CLAUDE,
  name: 'Claude',
  slug: 'claude',
  configFiles: [],
  secretBindings: [],
  mcpServerIds: [],
  skillIds: [],
  status: 'active',
  createdAt: '',
  updatedAt: '',
}

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
  rights: { canPost: boolean; canAsk: boolean; canSteer?: boolean; paused?: boolean; pausedForSetup?: boolean; mentionsYou?: boolean } = {
    canPost: true,
    canAsk: true,
  }
) {
  render(
    <Theme>
      <MemoryRouter>
        <TaskThread
          taskId="t-1"
          project="web"
          refreshKey="1"
          onOpenArtifact={onOpenArtifact}
          agents={[{ kind: 'agent', id: CLAUDE, name: 'Claude' }]}
          suggestionInput={SUGGESTION_INPUT}
          canPost={rights.canPost}
          canAsk={rights.canAsk}
          canSteer={rights.canSteer}
          paused={rights.paused}
          pausedForSetup={rights.pausedForSetup}
          mentionsYou={rights.mentionsYou}
          runnableAgents={[{ id: CLAUDE, name: 'Claude' }]}
          clankers={[CLAUDE_RUNNER]}
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

function question(overrides: Partial<Extract<TaskTimelineEntry, { kind: 'question' }>['question']> = {}): TaskTimelineEntry {
  const asked = {
    id: 'q-1',
    sessionId: 's-1',
    agent: { id: CLAUDE, name: 'Claude' },
    askedOf: { id: 'maria', name: 'Maria' },
    question: 'Which warehouse ships gift orders?',
    options: ['North', 'South'],
    blocking: true,
    status: 'open' as const,
    askedAt: '2026-10-01T10:09:00Z',
    answer: null,
    ...overrides,
  }
  return { kind: 'question', id: asked.id, at: asked.askedAt, question: asked }
}

describe('TaskThread and the agent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRole = 'member'
    mockBranch.mockResolvedValue(null)
    mockNextAgent.mockResolvedValue({ clankerId: null, via: null, problem: null })
    mockResumeTarget.mockResolvedValue({ sessionId: 's-1', clankerId: CLAUDE, action: 'code' })
  })

  describe("the agent's questions", () => {
    it('shows whom the agent asked and that it waits, and offers the answer above the composer', async () => {
      mockTimeline.mockResolvedValue([question()])
      renderThread()

      const entry = await screen.findByRole('listitem', { name: "Claude's question" })
      expect(entry).toHaveTextContent('Claude asks Maria')
      expect(entry).toHaveTextContent('The agent is waiting for the answer')
      const card = screen.getByRole('group', { name: "Answer Claude's question" })
      // The question is in full in one place only: the card that answers it.
      expect(within(entry).getByText(/answer it below/)).toBeInTheDocument()
      expect(card).toHaveTextContent("It's for Maria, who was notified. Anyone on the task can answer if they know.")
    })

    it('answers with an option in one press, and reloads the thread', async () => {
      mockTimeline.mockResolvedValue([question()])
      mockAnswer.mockResolvedValue({ sessionId: 's-1', turnId: 'turn-2', jobId: 'job-2', status: 'pending' })
      const { onAsked } = renderThread()

      fireEvent.click(await screen.findByRole('button', { name: 'South' }))
      await waitFor(() => expect(mockAnswer).toHaveBeenCalledWith('t-1', 'q-1', 'South'))
      await waitFor(() => expect(onAsked).toHaveBeenCalled())
    })

    it('takes a written answer', async () => {
      mockTimeline.mockResolvedValue([question({ options: [] })])
      mockAnswer.mockResolvedValue({ sessionId: 's-1', turnId: 'turn-2', jobId: 'job-2', status: 'pending' })
      renderThread()

      fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), { target: { value: 'The north one, from Monday' } })
      fireEvent.click(screen.getByRole('button', { name: 'Answer' }))
      await waitFor(() => expect(mockAnswer).toHaveBeenCalledWith('t-1', 'q-1', 'The north one, from Monday'))
    })

    it('shows the answer once given, with nothing left to answer', async () => {
      mockTimeline.mockResolvedValue([
        question({ status: 'answered', answer: { by: { id: 'maria', name: 'Maria' }, text: 'North', at: '2026-10-01T10:20:00Z' } }),
      ])
      renderThread()

      expect(await screen.findByRole('listitem', { name: "Claude's question" })).toHaveTextContent('Maria answered: North')
      expect(screen.queryByRole('group', { name: "Answer Claude's question" })).not.toBeInTheDocument()
    })

    it('says when someone answered for the person asked', async () => {
      mockTimeline.mockResolvedValue([
        question({ status: 'answered', answer: { by: { id: 'quinn', name: 'Quinn' }, text: 'North', at: '2026-10-01T10:20:00Z' } }),
      ])
      renderThread()

      expect(await screen.findByRole('listitem', { name: "Claude's question" })).toHaveTextContent('Quinn answered for Maria: North')
    })

    it("doesn't offer a viewer the answer", async () => {
      mockTimeline.mockResolvedValue([question()])
      renderThread(jest.fn(), jest.fn(), { canPost: false, canAsk: false })
      expect(await screen.findByRole('listitem', { name: "Claude's question" })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: "Answer Claude's question" })).not.toBeInTheDocument()
    })
  })

  describe('steering the agent', () => {
    const steerer = { canPost: true, canAsk: true, canSteer: true }

    it('lets the owner interrupt a working agent with their message, or pause it', async () => {
      mockTimeline.mockResolvedValue([agentTurn({ status: 'running', outcome: null })])
      mockInterrupt.mockResolvedValue({ sessionId: 's-1', turnId: 'turn-2', jobId: 'job-2', status: 'pending' })
      mockPause.mockResolvedValue(undefined)
      const { onAsked } = renderThread(jest.fn(), jest.fn(), steerer)

      fireEvent.change(await screen.findByRole('combobox', { name: 'Write a message' }), { target: { value: 'Use the new API' } })
      fireEvent.click(screen.getByRole('button', { name: 'Interrupt with this' }))
      await waitFor(() => expect(mockInterrupt).toHaveBeenCalledWith('t-1', 'Use the new API'))
      await waitFor(() => expect(onAsked).toHaveBeenCalled())

      fireEvent.click(screen.getByRole('button', { name: 'Pause the agent' }))
      await waitFor(() => expect(mockPause).toHaveBeenCalledWith('t-1'))
    })

    it("offers neither to someone who may only ask, nor while the agent isn't working", async () => {
      mockTimeline.mockResolvedValue([agentTurn({ status: 'running', outcome: null })])
      renderThread()
      expect(await screen.findByRole('combobox', { name: 'Write a message' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Interrupt with this' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pause the agent' })).not.toBeInTheDocument()
    })

    it('says the agent is paused, and lets the owner have it carry on', async () => {
      mockTimeline.mockResolvedValue([agentTurn({ status: 'cancelled', outcome: null })])
      mockResume.mockResolvedValue(undefined)
      renderThread(jest.fn(), jest.fn(), { ...steerer, paused: true })

      expect(await screen.findByRole('region', { name: 'The agent is paused' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Let it carry on' }))
      await waitFor(() => expect(mockResume).toHaveBeenCalledWith('t-1'))
    })
  })

  describe('taking the work over', () => {
    const BRANCH = { branch: 'viberator/t-1', repositoryUrl: 'https://github.com/acme/web', baseBranch: 'main', pushed: true, takenOver: null }
    const steerer = { canPost: true, canAsk: true, canSteer: true }

    it('pauses the agent and shows where the work is', async () => {
      mockTimeline.mockResolvedValue([agentTurn()])
      mockBranch.mockResolvedValue(BRANCH)
      mockTakeOver.mockResolvedValue({ ...BRANCH, takenOver: { by: { id: 'me', name: 'Me' }, at: '2026-10-02T10:00:00Z' } })
      renderThread(jest.fn(), jest.fn(), steerer)

      fireEvent.click(await screen.findByRole('button', { name: 'Take over' }))
      const card = await screen.findByRole('region', { name: 'Taken over' })
      expect(card).toHaveTextContent('Me is working on it locally')
      expect(screen.getByLabelText('Checkout commands')).toHaveTextContent('git switch viberator/t-1')
      expect(mockTakeOver).toHaveBeenCalledWith('t-1')
    })

    it('hands back with a note for the agent', async () => {
      mockTimeline.mockResolvedValue([agentTurn()])
      mockBranch.mockResolvedValue({ ...BRANCH, pushed: false, takenOver: { by: { id: 'me', name: 'Me' }, at: '2026-10-02T10:00:00Z' } })
      mockHandBack.mockResolvedValue(undefined)
      const { onAsked } = renderThread(jest.fn(), jest.fn(), steerer)

      expect(await screen.findByLabelText('Checkout commands')).toHaveTextContent('git switch -c viberator/t-1 origin/main')
      // Says which agent handing back resumes, before anyone does.
      expect(await screen.findByText(/Carrying on resumes Claude only, and asks it to build again/)).toBeInTheDocument()
      fireEvent.change(screen.getByRole('textbox', { name: 'Note for the agent' }), { target: { value: 'Fixed the header; add tests' } })
      fireEvent.click(screen.getByRole('button', { name: 'Hand back' }))
      await waitFor(() => expect(mockHandBack).toHaveBeenCalledWith('t-1', 'Fixed the header; add tests'))
      await waitFor(() => expect(onAsked).toHaveBeenCalled())
    })

    it('shows everyone else who has the work, without the controls', async () => {
      mockTimeline.mockResolvedValue([agentTurn()])
      mockBranch.mockResolvedValue({ ...BRANCH, takenOver: { by: { id: 'dev', name: 'Dev' }, at: '2026-10-02T10:00:00Z' } })
      renderThread()
      expect(await screen.findByRole('region', { name: 'Taken over' })).toHaveTextContent('Dev is working on it locally')
      expect(screen.queryByRole('button', { name: 'Hand back' })).not.toBeInTheDocument()
    })
  })

  describe('after a setup failure', () => {
    it('says the agent is paused until the fix, and lets an admin try this task or every paused one again', async () => {
      mockRole = 'admin'
      mockTimeline.mockResolvedValue([agentTurn({ status: 'failed', outcome: null })])
      mockResume.mockResolvedValue(undefined)
      mockRetryAll.mockResolvedValue(3)
      renderThread(jest.fn(), jest.fn(), { canPost: true, canAsk: true, canSteer: true, paused: true, pausedForSetup: true })

      const card = await screen.findByRole('region', { name: 'Paused until the setup is fixed' })
      fireEvent.click(within(card).getByRole('button', { name: 'Retry all paused runs' }))
      await waitFor(() => expect(mockRetryAll).toHaveBeenCalled())
      fireEvent.click(within(card).getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(mockResume).toHaveBeenCalledWith('t-1'))
    })

    it("doesn't offer members every paused run", async () => {
      mockTimeline.mockResolvedValue([agentTurn({ status: 'failed', outcome: null })])
      renderThread(jest.fn(), jest.fn(), { canPost: true, canAsk: true, canSteer: true, paused: true, pausedForSetup: true })
      const card = await screen.findByRole('region', { name: 'Paused until the setup is fixed' })
      expect(within(card).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
      expect(within(card).queryByRole('button', { name: 'Retry all paused runs' })).not.toBeInTheDocument()
    })
  })

  it('lets someone mentioned acknowledge it instead of replying', async () => {
    mockTimeline.mockResolvedValue([])
    mockMentionDone.mockResolvedValue(undefined)
    const { onAsked } = renderThread(jest.fn(), jest.fn(), { canPost: true, canAsk: true, mentionsYou: true })

    expect(await screen.findByText(/You were mentioned here/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge mention' }))
    await waitFor(() => expect(mockMentionDone).toHaveBeenCalledWith('t-1'))
    await waitFor(() => expect(onAsked).toHaveBeenCalled())
  })
})
