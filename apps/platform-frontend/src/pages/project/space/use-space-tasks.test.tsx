import { act, renderHook, waitFor } from '@testing-library/react'
import { notifyApiChange } from '@/service/api/apiChanges'
import { getTickets, type TicketListParams } from '@/service/api/ticket-api'
import { usePagedTasks } from './use-space-tasks'
import { testTask } from './test-task'

jest.mock('@/service/api/ticket-api', () => ({ getTickets: jest.fn() }))

const query: TicketListParams = { projectSlug: 'web' }
const original = testTask('1', { state: 'discussing', label: 'Discussing' })
const created = testTask('2', { state: 'discussing', label: 'Discussing' })

function page(tickets = [original]) {
  return { tickets, pagination: { limit: 20, offset: 0, count: tickets.length, total: tickets.length } }
}

describe('usePagedTasks', () => {
  beforeEach(() => jest.mocked(getTickets).mockReset())

  it('reloads the mounted task listing after a task mutation', async () => {
    jest.mocked(getTickets).mockResolvedValueOnce(page()).mockResolvedValueOnce(page([created, original]))
    const { result } = renderHook(() => usePagedTasks(query, 20))
    await waitFor(() => expect(result.current.tasks).toEqual([original]))
    act(() => notifyApiChange('/api/tasks'))
    await waitFor(() => expect(result.current.tasks).toEqual([created, original]))
    expect(result.current.total).toBe(2)
    expect(getTickets).toHaveBeenLastCalledWith({ ...query, limit: 20, offset: 0 })
  })

  it('ignores an older response that arrives after a mutation refresh', async () => {
    let resolveOld: (value: ReturnType<typeof page>) => void = () => undefined
    const oldRequest = new Promise<ReturnType<typeof page>>((resolve) => { resolveOld = resolve })
    jest.mocked(getTickets).mockReturnValueOnce(oldRequest).mockResolvedValueOnce(page([created]))
    const { result } = renderHook(() => usePagedTasks(query, 20))
    act(() => notifyApiChange('/api/tasks/task-1'))
    await waitFor(() => expect(result.current.tasks).toEqual([created]))
    await act(async () => resolveOld(page()))
    expect(result.current.tasks).toEqual([created])
  })

  it('leaves disabled listings unloaded after a mutation', () => {
    renderHook(() => usePagedTasks(query, 20, false))
    act(() => notifyApiChange('/api/tasks'))
    expect(getTickets).not.toHaveBeenCalled()
  })
})
