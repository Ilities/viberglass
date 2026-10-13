import { ShortcutCommenter } from '../src/backend/ShortcutCommenter'
import { ShortcutMemberCache } from '../src/backend/members/ShortcutMemberCache'
import { ShortcutMemberDirectory } from '../src/backend/members/ShortcutMemberDirectory'

const ACCESS = { base: 'https://api.example.test/api/v3', token: 'token-1' }

function respond(status: number, body: unknown = {}) {
  return jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

describe('Shortcut members', () => {
  it("finds a member's name and email with the connection's token", async () => {
    const fetchImpl = respond(200, { id: 'member-1', profile: { name: 'Jussi Hallila', mention_name: 'jussi', email_address: 'jussi@example.com' } })
    const directory = new ShortcutMemberDirectory(ACCESS, fetchImpl, new ShortcutMemberCache())

    await expect(directory.find('member-1')).resolves.toEqual({ name: 'Jussi Hallila', email: 'jussi@example.com', accountId: 'member-1' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v3/members/member-1',
      expect.objectContaining({ headers: expect.objectContaining({ 'Shortcut-Token': 'token-1' }) }),
    )
  })

  it('looks a member up once while the cache holds them, and again after it expires', async () => {
    let now = 0
    const cache = new ShortcutMemberCache(() => now)
    const fetchImpl = jest.fn().mockImplementation(async () => new Response(JSON.stringify({ profile: { name: 'Pat', email_address: null } }), { status: 200 }))
    const directory = new ShortcutMemberDirectory(ACCESS, fetchImpl, cache)

    await directory.find('member-2')
    await directory.find('member-2')
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    now = 2 * 60 * 60 * 1000
    await expect(directory.find('member-2')).resolves.toEqual({ name: 'Pat', email: null, accountId: 'member-2' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("is null for a member Shortcut doesn't know, and throws when Shortcut fails", async () => {
    await expect(new ShortcutMemberDirectory(ACCESS, respond(404), new ShortcutMemberCache()).find('gone')).resolves.toBeNull()
    await expect(new ShortcutMemberDirectory(ACCESS, respond(401), new ShortcutMemberCache()).find('member-3')).rejects.toThrow('401')
  })

  it('looks people up through the commenter with its API token', async () => {
    const fetchImpl = respond(200, { profile: { name: 'Maria', email_address: 'maria@example.com' } })
    const commenter = new ShortcutCommenter({ apiKey: 'key-1', baseUrl: 'https://api.example.test/api/v3/' }, fetchImpl)

    await expect(commenter.findPerson('member-commenter')).resolves.toEqual({ name: 'Maria', email: 'maria@example.com', accountId: 'member-commenter' })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.test/api/v3/members/member-commenter', expect.objectContaining({ headers: expect.objectContaining({ 'Shortcut-Token': 'key-1' }) }))
  })
})
