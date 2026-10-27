import { AsanaCommenter } from '../src/backend/AsanaCommenter'

describe('AsanaCommenter', () => {
  it('posts the comment as a task story', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('{"data":{"gid":"story-1"}}', { status: 201 })) as typeof fetch
    const commenter = new AsanaCommenter({ type: 'token', token: 'pat-test' }, fetchImpl)
    await commenter.postComment({ key: 'task/1', url: null, apiBaseUrl: null }, 'Build ready')
    expect(fetchImpl).toHaveBeenCalledWith('https://app.asana.com/api/1.0/tasks/task%2F1/stories', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer pat-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { text: 'Build ready' } }),
    }))
  })
})
