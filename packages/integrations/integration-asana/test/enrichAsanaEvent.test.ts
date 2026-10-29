import { enrichAsanaEvent } from '../src/backend/webhook/enrichAsanaEvent'
import { AsanaWebhookReceiver } from '../src/backend/webhook/AsanaWebhookReceiver'

const CREDENTIALS = { type: 'token' as const, token: 'pat-1' }
const TASK_EVENT = new AsanaWebhookReceiver().parseEvent(
  { action: 'added', resource: { gid: '500', resource_type: 'task' }, user: { gid: '11' }, created_at: '2026-03-01T10:00:00.000Z' },
  {},
)

function respond(status: number, body: unknown = {}) {
  return jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

describe('enrichAsanaEvent', () => {
  it('fetches the task with the connection token and the fields the issue needs', async () => {
    const fetchImpl = respond(200, { data: { gid: '500', name: 'Fix login', notes: 'Body', permalink_url: 'https://app.asana.com/0/1/500', completed: false } })
    const event = await enrichAsanaEvent(TASK_EVENT, CREDENTIALS, fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://app.asana.com/api/1.0/tasks/500?opt_fields=name,notes,permalink_url,completed',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer pat-1' }) }),
    )
    expect(event.payload).toEqual(expect.objectContaining({ task: expect.objectContaining({ name: 'Fix login' }) }))
  })

  it('fetches a comment story and keeps the event itself', async () => {
    const storyEvent = new AsanaWebhookReceiver().parseEvent(
      { action: 'added', resource: { gid: '777', resource_type: 'story' }, user: { gid: '11' } },
      {},
    )
    const fetchImpl = respond(200, { data: { resource_subtype: 'comment_added', text: 'hi', created_by: { gid: '11', name: 'Jussi' }, target: { gid: '500' } } })
    const event = await enrichAsanaEvent(storyEvent, CREDENTIALS, fetchImpl)

    expect(fetchImpl.mock.calls[0][0]).toBe('https://app.asana.com/api/1.0/stories/777?opt_fields=resource_subtype,text,created_by.name,target.gid')
    expect(event.payload).toEqual(expect.objectContaining({ resource: { gid: '777', resource_type: 'story' }, story: expect.objectContaining({ text: 'hi' }) }))
  })

  it('keeps a task that is gone as null, so the event is ignored rather than retried', async () => {
    const event = await enrichAsanaEvent(TASK_EVENT, CREDENTIALS, respond(404, { errors: [] }))
    expect(event.payload).toEqual(expect.objectContaining({ task: null }))
  })

  it('throws on a server error, so the delivery can be retried', async () => {
    await expect(enrichAsanaEvent(TASK_EVENT, CREDENTIALS, respond(500))).rejects.toThrow('HTTP 500')
  })

  it('leaves events it does not enrich alone', async () => {
    const removed = new AsanaWebhookReceiver().parseEvent({ action: 'removed', resource: { gid: '500', resource_type: 'task' } }, {})
    const fetchImpl = respond(200)

    await expect(enrichAsanaEvent(removed, CREDENTIALS, fetchImpl)).resolves.toBe(removed)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
