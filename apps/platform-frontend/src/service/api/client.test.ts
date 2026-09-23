import { apiFetch, SERVER_UNREACHABLE_MESSAGE, ServerUnreachableError } from './client'

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

    await expect(apiFetch('http://localhost:8888/api/projects')).rejects.toBe(aborted)
  })

  it('returns responses, including error statuses, as they are', async () => {
    const response = { ok: false, status: 500 }
    global.fetch = jest.fn().mockResolvedValue(response)

    await expect(apiFetch('http://localhost:8888/api/projects')).resolves.toBe(response)
  })
})
