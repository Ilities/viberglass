import { deleteClanker } from './clanker-api'

jest.mock('@/service/auth-storage', () => ({ getStoredAuthToken: () => null }))
const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })

it.each([{ message: 'Runner is in use' }, { error: 'Only admins can delete runners' }])('preserves deletion error details from the API', async (body) => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => body })
  await expect(deleteClanker('runner-id')).rejects.toThrow('message' in body ? body.message : body.error)
})

it('accepts a successful empty deletion response', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 })
  await expect(deleteClanker('runner-id')).resolves.toBeUndefined()
})
