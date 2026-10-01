import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Clanker, Ticket } from '@viberglass/types'
import { RunTicketModal } from './run-ticket-modal'

const mockAsk = jest.fn()
jest.mock('@/service/api/discussion-api', () => ({ askAgent: (...args: unknown[]) => mockAsk(...args) }))
jest.mock('@/service/api/project-api', () => ({
  getProjectReadiness: jest.fn().mockResolvedValue({ projectId: 'project-1', automationAvailable: true, checks: [] }),
  getProjectScmConfig: jest.fn().mockResolvedValue({
    projectId: 'project-1',
    integrationId: 'integration-1',
    sourceRepository: 'acme/shop',
    baseBranch: 'main',
    createdAt: '2026-07-22T10:00:00.000Z',
    updatedAt: '2026-07-22T10:00:00.000Z',
  }),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const ticket: Ticket = {
  id: 'ticket-1',
  key: 'WEB-1',
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
  it('asks the chosen agent for the research, in the thread', async () => {
    mockAsk.mockResolvedValue({ sessionId: 's-1', turnId: 't-1', jobId: 'job-1', status: 'pending' })
    const onClose = jest.fn()
    render(
      <Theme>
        <MemoryRouter>
          <RunTicketModal ticket={ticket} clankers={[runner]} project="shop" open onClose={onClose} mode="research" />
        </MemoryRouter>
      </Theme>,
    )

    expect(await screen.findByRole('heading', { name: 'Ask for the research' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ask the agent' }))

    await waitFor(() => expect(mockAsk).toHaveBeenCalledWith('ticket-1', { action: 'research', body: 'Write the research', agentId: 'runner-1' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByText(/job/i)).not.toBeInTheDocument()
  })

  it('names the branch, repository and base before a build starts', async () => {
    render(
      <Theme>
        <MemoryRouter>
          <RunTicketModal ticket={ticket} clankers={[runner]} project="shop" open onClose={jest.fn()} mode="execution" />
        </MemoryRouter>
      </Theme>,
    )

    expect(await screen.findByTestId('run-target-summary')).toHaveTextContent(
      'Pushes branch viberator/ticket-1 to acme/shop, then opens a pull request against main.',
    )
  })
})
