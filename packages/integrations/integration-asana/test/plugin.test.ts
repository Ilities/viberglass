import asanaPlugin from '../src/backend/plugin'
import { checkAsanaConnection } from '../src/backend/checkAsanaConnection'
import { AsanaCommenter } from '../src/backend/AsanaCommenter'

describe('Asana plugin', () => {
  it('describes itself for the connections page', () => {
    expect(asanaPlugin.id).toBe('asana')
    expect(asanaPlugin.label).toBe('Asana')
    expect(asanaPlugin.description).toBeTruthy()
    expect(asanaPlugin.category).toBe('ticketing')
    expect(asanaPlugin.receivesWebhooks).toBe(true)
    expect(asanaPlugin.defaultInboundEvents).toEqual(['task_added', 'task_changed', 'comment_added'])
  })

  it('tests the connection by reading the token’s user', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock)

    await checkAsanaConnection({ type: 'token', token: 'pat-1' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.asana.com/api/1.0/users/me',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer pat-1' }) }),
    )
  })

  it('fails the connection when Asana refuses the token', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))
    await expect(checkAsanaConnection({ type: 'token', token: 'bad' })).rejects.toThrow('HTTP 401')
  })

  it('posts a comment on the linked task with the token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const commenter = new AsanaCommenter({ type: 'token', token: 'pat-1' }, fetchMock)

    await commenter.postComment({ key: '1234', url: null, apiBaseUrl: null }, 'Done — via Viberglass')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.asana.com/api/1.0/tasks/1234/comments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer pat-1' }),
        body: JSON.stringify({ data: { text: 'Done — via Viberglass' } }),
      }),
    )
  })

  it('throws when Asana refuses a comment', async () => {
    const commenter = new AsanaCommenter({ type: 'token', token: 'pat-1' }, jest.fn().mockResolvedValue(new Response('', { status: 400 })))
    await expect(commenter.postComment({ key: '1', url: null, apiBaseUrl: null }, 'hi')).rejects.toThrow('400')
  })
})
