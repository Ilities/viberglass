import { getTicketDetails } from '@/data'
import { getAgentDirectory } from '@/service/api/agent-directory-api'
import { getTaskPlanParts } from '@/service/api/build-api'
import { getJobs } from '@/service/api/job-api'
import { listSessionsForTicket } from '@/service/api/session-api'
import { getPlan, getPlanComments, getTaskByKey, TaskNotFoundError } from '@/service/api/ticket-api'
import type { Ticket } from '@viberglass/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useTaskPage } from './use-task-page'

jest.mock('@/data', () => ({ getTicketDetails: jest.fn() }))
jest.mock('@/service/api/agent-directory-api', () => ({ getAgentDirectory: jest.fn() }))
jest.mock('@/service/api/build-api', () => ({ getTaskPlanParts: jest.fn() }))
jest.mock('@/service/api/job-api', () => ({ getJobs: jest.fn() }))
jest.mock('@/service/api/session-api', () => ({ listSessionsForTicket: jest.fn() }))
jest.mock('@/service/api/ticket-api', () => {
  class MockTaskNotFoundError extends Error {}
  return {
    getPlan: jest.fn(),
    getPlanComments: jest.fn(),
    getTaskByKey: jest.fn(),
    TaskNotFoundError: MockTaskNotFoundError,
  }
})

const TICKET: Ticket = {
  id: 'task-1',
  key: 'CA-5',
  projectId: 'p-1',
  timestamp: '',
  title: 'Let clinics take deposits',
  description: '',
  severity: 'medium',
  category: 'general',
  status: 'open',
  workflowPhase: 'planning',
  metadata: { timestamp: '', timezone: 'UTC' },
  annotations: [],
  ticketSystem: 'custom',
  autoFixRequested: false,
  createdAt: '',
  updatedAt: '',
}
const PLAN = { id: 'plan-1', ticketId: 'task-1', phase: 'planning' as const, content: '', createdAt: '', updatedAt: '' }

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getTicketDetails).mockResolvedValue(TICKET)
  jest.mocked(getJobs).mockResolvedValue({ jobs: [], count: 0 })
  jest.mocked(getPlan).mockResolvedValue({ document: PLAN, latestRun: null })
  jest.mocked(getPlanComments).mockResolvedValue([])
  jest.mocked(listSessionsForTicket).mockResolvedValue([])
  jest.mocked(getTaskPlanParts).mockRejectedValue(new Error('No pull requests'))
  jest.mocked(getAgentDirectory).mockResolvedValue([])
})

describe('useTaskPage', () => {
  it('reports a missing task as not found, whichever request fails first', async () => {
    jest.mocked(getJobs).mockRejectedValue(new Error('Failed to fetch jobs'))
    jest.mocked(getTicketDetails).mockImplementation(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new TaskNotFoundError()), 10))
    )

    const { result } = renderHook(() => useTaskPage('task-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.loadFailure).toBe('not-found')
    expect(result.current.data).toBeNull()
  })

  it('reports any other failure as a failed load, and loads again on retry', async () => {
    jest.mocked(getJobs).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const { result } = renderHook(() => useTaskPage('task-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.loadFailure).toBe('failed')

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.data?.ticket.id).toBe('task-1'))
    expect(result.current.loadFailure).toBeNull()
  })

  it('tells a key that matches no task from a key lookup that failed', async () => {
    jest.mocked(getTaskByKey).mockRejectedValueOnce(new TaskNotFoundError())
    const missing = renderHook(() => useTaskPage('CA-404'))
    await waitFor(() => expect(missing.result.current.loadFailure).toBe('not-found'))

    jest.mocked(getTaskByKey).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const failed = renderHook(() => useTaskPage('CA-5'))
    await waitFor(() => expect(failed.result.current.loadFailure).toBe('failed'))
  })
})
