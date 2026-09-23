import type { JobListItem } from '@/service/api/job-api'
import { getResearchDocument, type ResearchPhaseResponse } from '@/service/api/ticket-api'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import type { Ticket } from '@viberglass/types'
import { MemoryRouter } from 'react-router-dom'
import { PhaseSection } from './phase-section'

jest.mock('@/service/api/ticket-api', () => ({ getResearchDocument: jest.fn() }))
jest.mock('@/components/run-ticket-modal', () => ({ RunTicketModal: () => null }))
jest.mock('@/components/revision-modal', () => ({ RevisionModal: () => null }))
jest.mock('../sessions/LaunchSessionDialog', () => ({ LaunchSessionDialog: () => null }))
jest.mock('./phase-document-comments', () => ({ PhaseDocumentComments: () => <div>document</div> }))
jest.mock('./phase-logs', () => ({ PhaseLogs: () => null }))
jest.mock('./phase-session-panel', () => ({ PhaseSessionPanel: () => null }))
jest.mock('./approve-phase-button', () => ({ ApprovePhaseButton: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const timestamp = '2026-09-23T10:00:00.000Z'
const ticket: Ticket = {
  id: 'ticket-1',
  projectId: 'project-1',
  timestamp,
  title: 'Explain the checkout flow',
  description: 'How does checkout work?',
  severity: 'medium',
  category: 'General',
  status: 'open',
  workflowPhase: 'research',
  metadata: { timestamp, timezone: 'UTC' },
  annotations: [],
  ticketSystem: 'custom',
  autoFixRequested: false,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const researchPhase: ResearchPhaseResponse = {
  document: {
    id: 'doc-1',
    ticketId: ticket.id,
    phase: 'research',
    content: '# Findings',
    approvalState: 'draft',
    approvedAt: null,
    approvedBy: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  latestRun: null,
}

function researchJob(status: JobListItem['status']): JobListItem {
  return {
    jobId: 'job-1',
    jobKind: 'research',
    status,
    repository: 'example/shop',
    task: 'Research',
    tenantId: 'api-server',
    createdAt: timestamp,
    processedAt: null,
    finishedAt: null,
    ticketId: ticket.id,
    ticket: null,
  }
}

function renderResearchSection(jobs: JobListItem[]) {
  render(
    <Theme>
      <MemoryRouter>
        <PhaseSection
          ticket={ticket}
          clankers={[]}
          project="shop"
          phase="research"
          currentPhase="research"
          jobs={jobs}
          onSessionsChanged={jest.fn()}
        />
      </MemoryRouter>
    </Theme>
  )
}

describe('PhaseSection', () => {
  beforeEach(() => {
    jest.mocked(getResearchDocument).mockResolvedValue(researchPhase)
  })

  it('disables Revise while a run of the phase is in progress', async () => {
    renderResearchSection([researchJob('active')])

    const revise = await screen.findByRole('button', { name: /revise/i })
    expect(revise).toBeDisabled()
    expect(revise).toHaveAttribute(
      'title',
      'A research run is in progress. Wait for it to finish or cancel it before starting another.'
    )
  })

  it('says a new ticket has not started instead of claiming progress', async () => {
    jest.mocked(getResearchDocument).mockResolvedValue({
      ...researchPhase,
      document: { ...researchPhase.document, content: '' },
    })
    renderResearchSection([])

    expect(await screen.findByRole('button', { name: /research not started/i })).toBeInTheDocument()
    expect(screen.queryByText(/in progress/i)).not.toBeInTheDocument()
  })

  it('shows the agent working while a run is in progress', async () => {
    renderResearchSection([researchJob('active')])
    expect(await screen.findByRole('button', { name: /research agent working/i })).toBeInTheDocument()
  })

  it('shows a finished document as awaiting review', async () => {
    renderResearchSection([researchJob('completed')])
    expect(await screen.findByRole('button', { name: /research awaiting review/i })).toBeInTheDocument()
  })

  it('allows Revise once the run has finished', async () => {
    renderResearchSection([researchJob('completed')])

    expect(await screen.findByRole('button', { name: /revise/i })).toBeEnabled()
  })
})
