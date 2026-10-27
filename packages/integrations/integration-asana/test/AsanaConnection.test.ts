import { checkAsanaConnection } from '../src/backend/checkAsanaConnection'
import { AsanaCommenter } from '../src/backend/AsanaCommenter'

function respond(status: number, body: unknown = {}) {
  return jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

describe('Asana connection check', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('reads the member the token belongs to', async () => {
    global.fetch = respond(200, { data: { gid: '11' } })
    await expect(checkAsanaConnection({ type: 'token', token: 'pat-1' })).resolves.toBeUndefined()
    expect(global.fetch).toHaveBeenCalledWith('https://app.asana.com/api/1.0/users/me', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer pat-1' }) }))
  })

  it('says the token was rejected when Asana refuses it', async () => {
    global.fetch = respond(401, { errors: [{ message: 'Not Authorized' }] })
    await expect(checkAsanaConnection({ type: 'token', token: 'bad' })).rejects.toThrow('Asana rejected the personal access token: HTTP 401')
  })

  it('says the connection has no token when none is set', async () => {
    await expect(checkAsanaConnection({ type: 'token' })).rejects.toThrow('no personal access token')
  })

  it('says Asana could not be reached when the request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND app.asana.com'))
    await expect(checkAsanaConnection({ type: 'token', token: 'pat-1' })).rejects.toThrow("Asana couldn't be reached: getaddrinfo ENOTFOUND")
  })
})

describe('AsanaCommenter', () => {
  it('posts the comment as a story on the task, with the token', async () => {
    const fetchImpl = respond(201, { data: { gid: '900' } })
    await new AsanaCommenter({ token: 'pat-1' }, fetchImpl).postComment({ key: '500', url: null, apiBaseUrl: null }, 'Plan ready\n\n— via Viberglass')

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://app.asana.com/api/1.0/tasks/500/stories',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer pat-1', 'Content-Type': 'application/json' }),
        body: JSON.stringify({ data: { text: 'Plan ready\n\n— via Viberglass' } }),
      }),
    )
  })

  it("throws with Asana's answer when the comment isn't taken", async () => {
    const fetchImpl = respond(403, { errors: [{ message: 'forbidden' }] })
    await expect(new AsanaCommenter({ token: 'pat-1' }, fetchImpl).postComment({ key: '500', url: null, apiBaseUrl: null }, 'x')).rejects.toThrow("Asana didn't take the comment on task 500: 403")
  })
})
