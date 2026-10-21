import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { JobStatus } from '@/service/api/job-api'
import { RunFacts } from './run-facts'

const writeText = jest.fn(() => Promise.resolve())

const JOB: JobStatus = {
  jobId: 'run-1234',
  jobKind: 'execution',
  status: 'completed',
  progress: null,
  lastHeartbeat: null,
  progressUpdates: [],
  logs: [],
  data: {
    id: 'run-1234',
    jobKind: 'execution',
    tenantId: 'tenant-1',
    repository: 'https://github.com/example/web.git',
    task: 't-1',
    branch: null,
    baseBranch: null,
    context: null,
    settings: null,
    timestamp: 0,
  },
  result: { success: true },
  failedReason: null,
  createdAt: '2026-09-30T10:00:00.000Z',
  processedAt: '2026-09-30T10:00:00.000Z',
  finishedAt: '2026-09-30T10:01:00.000Z',
  ticketId: null,
  ticket: null,
  agentSessionId: null,
  clankerId: null,
  clanker: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('RunFacts', () => {
  it('copies the run ID', async () => {
    render(
      <Theme>
        <RunFacts job={JOB} isPolling={false} />
      </Theme>
    )

    expect(screen.getByText('run-1234')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy run ID run-1234' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('run-1234'))
  })
})
