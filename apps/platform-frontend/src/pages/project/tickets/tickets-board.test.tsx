import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Ticket, TicketWorkflowPhase } from '@viberglass/types'
import { TicketsBoard } from './tickets-board'

jest.mock('@/service/api/job-api', () => ({ runTicket: jest.fn() }))
jest.mock('@/service/api/ticket-api', () => ({ runPlanning: jest.fn(), runResearch: jest.fn() }))
jest.mock('@/service/api/session-api', () => ({ launchSession: jest.fn() }))
jest.mock('@/service/api/project-api', () => ({ getProjectReadiness: jest.fn() }))
jest.mock('@/data', () => ({
  formatSeverity: () => ({ label: 'Medium', badgeColor: 'amber' }),
  formatAutoFixStatus: () => ({ label: 'Pending', color: 'zinc' }),
}))

function makeTicket(id: string, title: string, workflowPhase: TicketWorkflowPhase): Ticket {
  const timestamp = '2026-07-22T10:00:00.000Z'
  return {
    id,
    projectId: 'project-1',
    timestamp,
    title,
    description: `${title} description`,
    severity: 'medium',
    category: 'General',
    status: 'open',
    workflowPhase,
    metadata: { timestamp, timezone: 'UTC' },
    annotations: [],
    ticketSystem: 'custom',
    autoFixRequested: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

describe('TicketsBoard', () => {
  it('renders tickets directly in the three workflow phase columns', () => {
    const { container } = render(
      <Theme>
        <MemoryRouter>
          <TicketsBoard
            tickets={[
              makeTicket('research-1', 'Research ticket', 'research'),
              makeTicket('planning-1', 'Planning ticket', 'planning'),
              makeTicket('execution-1', 'Execution ticket', 'execution'),
            ]}
            clankers={[]}
            project="shop"
            selectedTicketIds={new Set()}
            showArchived={false}
            isArchiveMutationPending={false}
            visiblePhases={['research', 'planning', 'execution']}
            visibleStatuses={['open']}
            onToggleTicketSelection={jest.fn()}
            onArchiveTicket={jest.fn()}
            onUnarchiveTicket={jest.fn()}
          />
        </MemoryRouter>
      </Theme>,
    )

    expect(container.querySelectorAll('section')).toHaveLength(3)
    expect(screen.getByRole('heading', { name: 'Research' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Planning' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Execution' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Research ticket' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Planning ticket' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Execution ticket' })).toBeInTheDocument()
  })
})
