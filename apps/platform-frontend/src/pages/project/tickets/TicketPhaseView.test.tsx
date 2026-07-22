import { listSessionsForTicket, type AgentSession } from '@/service/api/session-api'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import type { Ticket } from '@viberglass/types'
import { MemoryRouter } from 'react-router-dom'
import { TicketPhaseView } from './TicketPhaseView'

jest.mock('@/service/api/session-api', () => ({ listSessionsForTicket: jest.fn() }))
jest.mock('./phase-section', () => ({
  PhaseSection: ({ phase }: { phase: string }) => <div>{phase} phase</div>,
}))
jest.mock('./phase-logs', () => ({ TicketLogsSummary: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const timestamp = '2026-07-22T10:00:00.000Z'
const ticket: Ticket = {
  id: 'ticket-1',
  projectId: 'project-1',
  timestamp,
  title: 'Retain a cancelled planning attempt',
  description: 'The transcript must remain available.',
  severity: 'medium',
  category: 'General',
  status: 'open',
  workflowPhase: 'planning',
  metadata: { timestamp, timezone: 'UTC' },
  annotations: [],
  ticketSystem: 'custom',
  autoFixRequested: false,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const cancelledSession: AgentSession = {
  id: 'session-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  projectSlug: 'shop',
  ticketId: ticket.id,
  ticketTitle: ticket.title,
  clankerId: 'runner-1',
  mode: 'planning',
  status: 'cancelled',
  title: null,
  repository: 'example/shop',
  baseBranch: 'main',
  workspaceBranch: null,
  draftPullRequestUrl: null,
  headCommitHash: null,
  lastJobId: 'run-1',
  lastTurnId: 'turn-1',
  latestPendingRequestId: null,
  createdBy: 'submitter@example.test',
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: timestamp,
}

describe('TicketPhaseView', () => {
  it('keeps cancelled collaboration sessions in ticket history', async () => {
    jest.mocked(listSessionsForTicket).mockResolvedValue([cancelledSession])

    render(
      <Theme>
        <MemoryRouter>
          <TicketPhaseView
            ticket={ticket}
            clankers={[]}
            project="shop"
            onWorkflowPhaseChange={jest.fn()}
            onApprovalStateChange={jest.fn()}
            onResolve={jest.fn()}
            jobs={[]}
          />
        </MemoryRouter>
      </Theme>
    )

    expect(await screen.findByRole('heading', { name: 'Collaboration history' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /planning session cancelled/i })).toHaveAttribute(
      'href',
      '/project/shop/sessions/session-1'
    )
  })
})
