import type { JobStatus } from '@/service/api/job-api'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TaskRunInspector } from './task-run-inspector'

const mockGetJob = jest.fn()
const mockRecord = jest.fn()
const mockEvents = jest.fn()
jest.mock('@/service/api/job-api', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  listRunEvents: (...args: unknown[]) => mockEvents(...args),
}))
jest.mock('@/service/api/run-record-api', () => ({ getRunRecord: (...args: unknown[]) => mockRecord(...args) }))
jest.mock('@/components/log-viewer', () => ({ LogViewer: () => <p>Worker output</p> }))

const JOB: JobStatus = {
  jobId: 'job-1', jobKind: 'reply', status: 'completed',
  progress: null, lastHeartbeat: null, progressUpdates: [], logs: [],
  data: {
    id: 'job-1', jobKind: 'reply', tenantId: 'tenant-1', repository: 'Utilities/token.observer',
    task: 'Check tokens on cancellation', branch: null, baseBranch: 'main', context: null, settings: null, timestamp: 0,
  },
  result: { success: true }, failedReason: null,
  createdAt: '2026-10-05T14:09:00Z', processedAt: '2026-10-05T14:09:00Z', finishedAt: '2026-10-05T14:14:10Z',
  ticketId: 'task-1', ticket: null, agentSessionId: 'session-1', clankerId: null, clanker: null,
}

function inspect(linkedTab: string | null = null) {
  const onClose = jest.fn()
  render(<Theme><MemoryRouter><TaskRunInspector jobId="job-1" title="Reply run #3" linkedTab={linkedTab} onClose={onClose} /></MemoryRouter></Theme>)
  return onClose
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetJob.mockResolvedValue(JOB)
  mockRecord.mockResolvedValue(null)
  mockEvents.mockResolvedValue([])
})

describe('TaskRunInspector', () => {
  it('opens activity with the run facts, and loads other details only when expanded', async () => {
    inspect()
    expect(await screen.findByText('5m 10s')).toBeInTheDocument()
    expect(await screen.findByText('Worker output')).toBeInTheDocument()
    expect(screen.queryByText('Check tokens on cancellation')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Prompt', { selector: 'summary' }))
    expect(await screen.findByText('Check tokens on cancellation')).toBeInTheDocument()
    expect(screen.getByText('Worker output')).toBeInTheDocument()
    expect(mockGetJob).toHaveBeenCalledWith('job-1')
  })

  it('honors links to the prompt and technical record', async () => {
    inspect('record')
    expect(await screen.findByText(/This run has no record/)).toBeInTheDocument()
    expect(screen.queryByText('Worker output')).not.toBeInTheDocument()
    expect(screen.queryByText('Check tokens on cancellation')).not.toBeInTheDocument()
  })

  it('dismisses with Escape or the close button', async () => {
    const onClose = inspect('prompt')
    expect(await screen.findByText('Check tokens on cancellation')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Close run details' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows a failed request and lets the user retry it', async () => {
    mockGetJob.mockRejectedValueOnce(new Error('Run not found'))
    inspect()
    expect(await screen.findByRole('alert')).toHaveTextContent('Run not found')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('5m 10s')).toBeInTheDocument()
    expect(mockGetJob).toHaveBeenCalledTimes(2)
  })

  it('shows why the run failed first, and the raw error under technical details', async () => {
    const failure = {
      code: 'AGENT_UNRESPONSIVE', title: 'Agent stopped responding', summary: 'The agent stopped sending updates.',
      category: 'platform' as const, retryable: true, technicalDetail: 'Job failed: No heartbeat received within grace period',
    }
    mockGetJob.mockResolvedValue({ ...JOB, status: 'failed', result: { success: false, failure } })
    inspect('prompt')
    expect(await screen.findByRole('alert')).toHaveTextContent('Agent stopped responding')
    expect(screen.queryByText(/No heartbeat/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Technical details', { selector: 'summary' }))
    expect(await screen.findByText(/No heartbeat received/)).toBeInTheDocument()
  })

  it('shows a failure without a known reason as a failed run', async () => {
    mockGetJob.mockResolvedValue({ ...JOB, status: 'failed', result: { success: false, errorMessage: 'Observer crashed' } })
    inspect('prompt')
    expect(await screen.findByRole('alert')).toHaveTextContent('Run failed')
  })
})
