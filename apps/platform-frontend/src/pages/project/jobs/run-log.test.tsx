import type { JobStatus } from '@/service/api/job-api'
import { render, screen } from '@testing-library/react'
import { RunLog } from './run-log'

const mockListRunEvents = jest.fn()
jest.mock('@/service/api/job-api', () => ({
  listRunEvents: (...args: unknown[]) => mockListRunEvents(...args),
}))
jest.mock('@/components/log-viewer', () => ({
  LogViewer: ({ logs }: { logs: Array<{ message: string }> }) => (
    <p>{`Worker lines: ${logs.map((log) => log.message).join(', ')}`}</p>
  ),
}))

function job(status: JobStatus['status']): Pick<JobStatus, 'jobId' | 'status' | 'logs'> {
  return {
    jobId: 'job-1',
    status,
    logs: [{ id: 'l1', level: 'info', message: 'Cloning repository', source: null, createdAt: '' }],
  }
}

const EVENTS = [
  {
    id: 'e1',
    sequence: 1,
    eventType: 'tool_call_started',
    payloadJson: { toolCallId: 'c1', toolName: 'bash', input: { command: 'git status' } },
    createdAt: '',
  },
  {
    id: 'e2',
    sequence: 2,
    eventType: 'assistant_message',
    payloadJson: { text: 'Exploring the repository.' },
    createdAt: '',
  },
]

beforeEach(() => mockListRunEvents.mockReset())

describe('RunLog', () => {
  it("shows what the agent did, live while it runs, with the worker's lines folded under it", async () => {
    mockListRunEvents.mockResolvedValue(EVENTS)
    render(<RunLog job={job('active')} isPolling />)

    expect(await screen.findByText('git status')).toBeInTheDocument()
    expect(screen.getByText('Exploring the repository.')).toBeInTheDocument()
    expect(screen.getByText('1 tool call · live')).toBeInTheDocument()
    expect(screen.getByText('Worker log · 1 lines')).toBeInTheDocument()
    expect(mockListRunEvents).toHaveBeenCalledWith('job-1', 0)
  })

  it('shows only the worker log for a run the agent recorded nothing in', async () => {
    mockListRunEvents.mockResolvedValue([])
    render(<RunLog job={job('completed')} isPolling={false} />)

    expect(await screen.findByText('Worker lines: Cloning repository')).toBeInTheDocument()
    expect(screen.queryByText(/tool call/)).not.toBeInTheDocument()
  })
})
