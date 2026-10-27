import { AsanaCommenter } from '../src/backend/AsanaCommenter'
import { checkAsanaConnection } from '../src/backend/checkAsanaConnection'

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const ISSUE = { key: '1200', url: 'https://app.asana.com/0/900/1200', apiBaseUrl: null }

describe('AsanaCommenter', () => {
  it('posts a comment to the task as the connection account', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(201, { data: { gid: '1' } }))
    const commenter = new AsanaCommenter({ type: 'token', token: 'pat-1', baseUrl: 'https://asana.test/api/1.0/' }, fetchImpl)

    await commenter.postComment(ISSUE, 'The plan is ready.')

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://asana.test/api/1.0/tasks/1200/stories',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer pat-1' }),
        body: JSON.stringify({ data: { text: 'The plan is ready.' } }),
      }),
    )
  })

  it("reports Asana's own message when it refuses the comment", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(403, { errors: [{ message: 'task: Not authorized' }] }))
    const commenter = new AsanaCommenter({ type: 'token', token: 'pat-1' }, fetchImpl)

    await expect(commenter.postComment(ISSUE, 'hi')).rejects.toThrow('task: Not authorized')
  })

  it('looks a person up by gid', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { data: { gid: 'user-1', name: 'Maria', email: 'maria@example.com' } }))
    const commenter = new AsanaCommenter({ type: 'token', token: 'pat-1' }, fetchImpl)

    await expect(commenter.findPerson('user-1')).resolves.toEqual({ name: 'Maria', email: 'maria@example.com', accountId: 'user-1' })
  })
})

describe('checkAsanaConnection', () => {
  afterEach(() => jest.restoreAllMocks())

  it("tells the user Asana's reason when the token is refused", async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(401, { errors: [{ message: 'Not authorized' }] }))

    await expect(checkAsanaConnection({ type: 'token', token: 'bad' })).rejects.toThrow('Asana authentication failed: Asana refused the personal access token: HTTP 401 Not authorized')
  })

  it('succeeds when Asana reads the token owner', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, { data: { gid: 'user-1', name: 'Viberglass' } }))

    await expect(checkAsanaConnection({ type: 'token', token: 'pat-1' })).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/users/me'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer pat-1' }) }))
  })

  it('says when the connection has no token', async () => {
    await expect(checkAsanaConnection({ type: 'token' })).rejects.toThrow('no personal access token')
  })
})
