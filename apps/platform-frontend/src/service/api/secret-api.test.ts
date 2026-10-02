import { listAllSecrets } from './secret-api'

jest.mock('@/service/auth-storage', () => ({ getStoredAuthToken: () => null }))

function page(count: number, offset: number) {
  return {
    ok: true,
    json: async () => ({
      data: Array.from({ length: count }, (_, index) => ({ id: `s${offset + index}`, name: `SECRET_${offset + index}` })),
    }),
  }
}

describe('listAllSecrets', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('keeps fetching until a page comes back short', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(page(100, 0))
      .mockResolvedValueOnce(page(30, 100))

    const secrets = await listAllSecrets()

    expect(secrets).toHaveLength(130)
    expect(global.fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('limit=100&offset=100'), expect.anything())
  })
})
