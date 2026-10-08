import { apiFetch, SERVER_UNREACHABLE_MESSAGE, ServerUnreachableError } from './client'
import { subscribeApiChanges } from './apiChanges'

jest.mock('@/service/auth-storage', () => ({ getStoredAuthToken: () => null }))

describe('apiFetch', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('explains a network failure instead of "Failed to fetch"', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const request = apiFetch('http://localhost:8888/api/auth/login')

    await expect(request).rejects.toBeInstanceOf(ServerUnreachableError)
    await expect(request).rejects.toThrow(SERVER_UNREACHABLE_MESSAGE)
  })

  it('lets aborted requests through unchanged', async () => {
    const aborted = new DOMException('The operation was aborted.', 'AbortError')
    global.fetch = jest.fn().mockRejectedValue(aborted)

    await expect(apiFetch('http://localhost:8888/api/spaces')).rejects.toBe(aborted)
  })

  it('returns responses, including error statuses, as they are', async () => {
    const response = { ok: false, status: 500 }
    global.fetch = jest.fn().mockResolvedValue(response)

    await expect(apiFetch('http://localhost:8888/api/spaces')).resolves.toBe(response)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('notifies mounted consumers after a successful %s', async (method) => {
    const listener = jest.fn()
    const unsubscribe = subscribeApiChanges(listener)
    global.fetch = jest.fn().mockResolvedValue({ ok: true })
    try {
      await apiFetch('http://localhost:8888/api/spaces/space-1?example=1', { method })
      expect(listener).toHaveBeenCalledWith('/api/spaces/space-1')
      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      unsubscribe()
    }
  })

  it('does not invalidate data on reads or unsuccessful writes', async () => {
    const listener = jest.fn()
    const unsubscribe = subscribeApiChanges(listener)
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    try {
      await apiFetch('/api/spaces')
      await apiFetch('/api/spaces', { method: 'POST' })
      await expect(apiFetch('/api/spaces', { method: 'POST' })).rejects.toBeInstanceOf(ServerUnreachableError)
      expect(listener).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })
})
