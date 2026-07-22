import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Clanker, Ticket } from '@viberglass/types'
import { RunTicketModal } from './run-ticket-modal'

jest.mock('@/service/api/job-api', () => ({ runTicket: jest.fn() }))
jest.mock('@/service/api/ticket-api', () => ({ runPlanning: jest.fn(), runResearch: jest.fn() }))
jest.mock('@/service/api/session-api', () => ({ launchSession: jest.fn() }))
jest.mock('@/service/api/project-api', () => ({
  getProjectReadiness: jest.fn().mockResolvedValue({ projectId: 'project-1', automationAvailable: true, checks: [] }),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const ticket: Ticket = {
  id: 'ticket-1',
  projectId: 'project-1',
  timestamp: '2026-07-22T10:00:00.000Z',
  title: 'Checkout button is unresponsive',
  description: 'Clicking checkout has no effect.',
  severity: 'medium',
  category: 'General',
  status: 'open',
  workflowPhase: 'research',
  metadata: { timestamp: '2026-07-22T10:00:00.000Z', timezone: 'UTC' },
  annotations: [],
  ticketSystem: 'custom',
  autoFixRequested: false,
  createdAt: '2026-07-22T10:00:00.000Z',
  updatedAt: '2026-07-22T10:00:00.000Z',
}

const runner: Clanker = {
  id: 'runner-1',
  name: 'Primary runner',
  slug: 'primary-runner',
  deploymentStrategyId: 'strategy-1',
  configFiles: [],
  secretIds: ['secret-1'],
  status: 'active',
  createdAt: '2026-07-22T10:00:00.000Z',
  updatedAt: '2026-07-22T10:00:00.000Z',
}

describe('RunTicketModal', () => {
  it('offers automatic and live modes from one Research launcher', async () => {
    render(
      <Theme>
        <MemoryRouter>
          <RunTicketModal ticket={ticket} clankers={[runner]} project="shop" open onClose={jest.fn()} mode="research" />
        </MemoryRouter>
      </Theme>,
    )

    expect(await screen.findByRole('heading', { name: 'Start Research' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run automatically' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collaborate live' })).toBeInTheDocument()
    expect(screen.queryByText(/job/i)).not.toBeInTheDocument()
  })
})
