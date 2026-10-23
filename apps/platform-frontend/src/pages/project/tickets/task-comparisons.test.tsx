import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TaskComparisonArm, TaskComparisonsView } from '@viberglass/types'
import { MemoryRouter } from 'react-router-dom'
import { pickComparisonWinner, startTaskComparison } from '@/service/api/comparison-api'
import { CompareAgentsDialog } from './compare-agents-dialog'
import { ComparisonForkBanner, TaskComparisons } from './task-comparisons'

jest.mock('@/service/api/comparison-api', () => ({ startTaskComparison: jest.fn(), pickComparisonWinner: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const EMPTY: TaskComparisonsView = { comparisons: [], armOf: null }

function arm(overrides: Partial<TaskComparisonArm>): TaskComparisonArm {
  return {
    ticketId: 'fork-1',
    key: 'WEB-2',
    title: 'Gift notes · Claude Code',
    status: 'in_review',
    runner: { id: 'claude', name: 'Claude Code' },
    running: false,
    runs: 1,
    lastRunStatus: 'completed',
    intent: 'I added the note field.',
    pullRequestUrl: 'https://github.com/acme/web/pull/7',
    branch: 'viberglass/t-1-claude-code',
    commit: 'abc1234',
    model: 'claude-sonnet-5',
    costUsd: 0.42,
    durationMs: 252_000,
    ...overrides,
  }
}

const VIEW: TaskComparisonsView = {
  armOf: null,
  comparisons: [
    {
      id: 'cmp-1',
      parentTicketId: 't-1',
      forkedAt: '2026-10-20T10:00:00.000Z',
      forkedFromTurnId: 'turn-1',
      baseBranch: 'viberglass/t-1',
      baseCommit: 'abc1234def',
      winnerTicketId: null,
      createdBy: { id: 'u-1', name: 'Ana' },
      createdAt: '2026-10-20T10:00:00.000Z',
      arms: [
        arm({}),
        arm({ ticketId: 'fork-2', key: 'WEB-3', runner: { id: 'opencode', name: 'OpenCode' }, running: true, pullRequestUrl: null, intent: null, model: 'glm-4.6' }),
      ],
    },
  ],
}

function renderIn(node: React.ReactNode) {
  return render(
    <Theme>
      <MemoryRouter>{node}</MemoryRouter>
    </Theme>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('TaskComparisons', () => {
  it('shows each fork side by side with how its runs went', () => {
    renderIn(<TaskComparisons taskId="t-1" view={VIEW} space="web" canPick onChanged={jest.fn()} />)

    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Pull request open')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet-5 · 1 run · 4m 12s · $0.42')).toBeInTheDocument()
    expect(screen.getByText('Working…')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'WEB-3' })).toHaveAttribute('href', '/spaces/web/tasks/WEB-3')
  })

  it('picks a fork as the winner', async () => {
    const picked = { ...VIEW, comparisons: [{ ...VIEW.comparisons[0], winnerTicketId: 'fork-1' }] }
    jest.mocked(pickComparisonWinner).mockResolvedValue(picked)
    const onChanged = jest.fn()
    renderIn(<TaskComparisons taskId="t-1" view={VIEW} space="web" canPick onChanged={onChanged} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Pick this' })[0])

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(picked))
    expect(pickComparisonWinner).toHaveBeenCalledWith('t-1', 'cmp-1', 'fork-1')
  })

  it('shows nothing without comparisons, and no pick buttons for those who may not pick', () => {
    const { unmount } = renderIn(<TaskComparisons taskId="t-1" view={EMPTY} space="web" canPick onChanged={jest.fn()} />)
    expect(screen.queryByText(/Agent comparisons/)).not.toBeInTheDocument()
    unmount()

    renderIn(<TaskComparisons taskId="t-1" view={VIEW} space="web" canPick={false} onChanged={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Pick this' })).not.toBeInTheDocument()
  })
})

describe('ComparisonForkBanner', () => {
  it('links a fork back to the comparison on its original', () => {
    renderIn(
      <ComparisonForkBanner
        space="web"
        armOf={{ comparisonId: 'cmp-1', parent: { id: 't-1', key: 'WEB-1', title: 'Gift notes' }, runner: { id: 'claude', name: 'Claude Code' }, forkedAt: '2026-10-20T10:00:00.000Z', winner: true }}
      />
    )

    expect(screen.getByRole('link', { name: 'WEB-1 Gift notes' })).toHaveAttribute('href', '/spaces/web/tasks/WEB-1#comparisons')
    expect(screen.getByText('Picked')).toBeInTheDocument()
  })
})

describe('CompareAgentsDialog', () => {
  const AGENTS = [
    { id: 'claude', name: 'Claude Code' },
    { id: 'opencode', name: 'OpenCode' },
  ]

  it('starts once two agents are picked, from the turn it was opened on', async () => {
    jest.mocked(startTaskComparison).mockResolvedValue(VIEW)
    const onStarted = jest.fn()
    renderIn(
      <CompareAgentsDialog taskId="t-1" agents={AGENTS} open from={{ turnId: 'turn-1', label: "Claude Code's turn" }} onClose={jest.fn()} onStarted={onStarted} />
    )

    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Claude Code' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'OpenCode' }))
    fireEvent.click(screen.getByRole('button', { name: 'Compare 2 agents' }))

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(VIEW))
    expect(startTaskComparison).toHaveBeenCalledWith('t-1', { agentIds: ['claude', 'opencode'], message: '', action: 'code', fromTurnId: 'turn-1' })
  })

  it('needs a message to ask for a reply', () => {
    renderIn(<CompareAgentsDialog taskId="t-1" agents={AGENTS} open from={null} onClose={jest.fn()} onStarted={jest.fn()} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Claude Code' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'OpenCode' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))

    expect(screen.getByRole('button', { name: 'Compare 2 agents' })).toBeDisabled()
  })
})
