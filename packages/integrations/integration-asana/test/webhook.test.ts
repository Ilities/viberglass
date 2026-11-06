import crypto from 'crypto'
import type { InboundWebhookEvent } from '@viberglass/integration-core'
import { AsanaWebhookReceiver } from '../src/backend/webhook/AsanaWebhookReceiver'

const receiver = new AsanaWebhookReceiver()

function sign(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

const TASK_EVENT = {
  data: {
    gid: '111',
    name: 'Fix the login',
    resource_type: 'task',
    action: 'added',
    parent: { gid: '999', name: 'Engineering', resource_type: 'project' },
    user: { gid: 'u-1', name: 'Jussi Hallila', resource_type: 'user' },
    created_at: '2026-10-07T00:00:00.000Z',
  },
}

const STORY_EVENT = {
  data: {
    gid: '555',
    resource_type: 'story',
    action: 'added',
    parent: { gid: '111', name: 'Fix the login', resource_type: 'task' },
    user: { gid: 'u-2', name: 'Pat', resource_type: 'user' },
    created_at: '2026-10-07T01:00:00.000Z',
  },
}

describe('AsanaWebhookReceiver handshake', () => {
  it('echoes the secret Asana offers when there is no signature', () => {
    expect(receiver.handshake?.({ 'x-hook-secret': 'shhh' })).toEqual({ secret: 'shhh' })
  })

  it('is not a handshake once deliveries are signed', () => {
    expect(receiver.handshake?.({ 'x-hook-secret': 'shhh', 'x-hook-signature': 'abc' })).toBeUndefined()
    expect(receiver.handshake?.({ 'x-hook-signature': 'abc' })).toBeUndefined()
  })
})

describe('AsanaWebhookReceiver signature', () => {
  it('verifies the hex HMAC-SHA256 of the raw body', () => {
    const body = JSON.stringify({ events: [TASK_EVENT] })
    expect(receiver.verifySignature(Buffer.from(body), sign('secret', body), 'secret')).toBe(true)
    expect(receiver.verifySignature(Buffer.from(body), 'deadbeef', 'secret')).toBe(false)
  })
})

describe('AsanaWebhookReceiver parsing', () => {
  it('splits a batched delivery into one event each', () => {
    const events = receiver.parseEvents({ events: [TASK_EVENT, STORY_EVENT] })
    expect(events.map((event) => event.eventType)).toEqual(['task_added', 'comment_added'])
    expect(events[0].deduplicationId).toBe('111:added:2026-10-07T00:00:00.000Z')
    expect(events[0].metadata).toEqual({ action: 'added', issueKey: '111', projectId: '999', sender: 'Jussi Hallila' })
    expect(events[1].metadata).toEqual({ action: 'added', issueKey: '111', commentId: '555', sender: 'Pat' })
  })

  it('answers a heartbeat with no events', () => {
    expect(receiver.parseEvents({ events: [] })).toEqual([])
  })

  it('re-parses a stored single event on retry', () => {
    const parsed = receiver.parseEvent(TASK_EVENT.data)
    expect(parsed.eventType).toBe('task_added')
    expect(parsed.payload).toEqual(TASK_EVENT.data)
  })
})

describe('AsanaWebhookReceiver reading', () => {
  function event(eventType: string, payload: unknown): InboundWebhookEvent {
    return { eventType, deduplicationId: 'd', timestamp: '2026-10-07T00:00:00.000Z', metadata: {}, payload }
  }

  it('reads a task event into an issue with its Asana url', () => {
    expect(receiver.read(event('task_added', TASK_EVENT.data), { botUsername: null })).toEqual({
      kind: 'issue',
      issue: {
        key: '111',
        url: 'https://app.asana.com/0/999/111',
        apiBaseUrl: null,
        title: 'Fix the login',
        author: { name: 'Jussi Hallila', email: null, accountId: 'u-1' },
        severity: 'medium',
        labels: [],
        repository: null,
        metadata: { asanaResourceType: 'task', asanaProjectId: '999' },
      },
    })
  })

  it('marks a completed task event closed', () => {
    const action = receiver.read(event('task_changed', { ...TASK_EVENT.data, action: 'completed' }), { botUsername: null })
    expect(action).toEqual(expect.objectContaining({ issue: expect.objectContaining({ stateChange: 'closed' }) }))
  })

  it('fetches the task notes and tags the event omits', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { notes: 'Steps to reproduce', name: 'Fix the login', completed: false, tags: [{ name: 'Bug' }] } }), { status: 200 }),
    )
    const withFetch = new AsanaWebhookReceiver(fetchMock)

    const action = await withFetch.readAsync(event('task_added', TASK_EVENT.data), { botUsername: null, credentials: { type: 'token', token: 'pat' } })
    expect(action).toEqual(
      expect.objectContaining({ issue: expect.objectContaining({ description: 'Steps to reproduce', labels: ['Bug'] }) }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/tasks/111?opt_fields='),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer pat' }) }),
    )
  })

  it('fetches the comment text the event omits and notices a bot mention', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ data: { text: 'Please look @viberglass' } }), { status: 200 }))
    const withFetch = new AsanaWebhookReceiver(fetchMock)

    const action = await withFetch.readAsync(event('comment_added', STORY_EVENT.data), { botUsername: 'viberglass', credentials: { type: 'token', token: 'pat' } })
    expect(action).toEqual({
      kind: 'comment',
      comment: { issueKey: '111', author: { name: 'Pat', email: null, accountId: 'u-2' }, body: 'Please look', mentionsBot: true },
    })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/stories/555?opt_fields=text'), expect.anything())
  })

  it('fails a comment read when Asana won’t return its text, so it can be retried', async () => {
    const withFetch = new AsanaWebhookReceiver(jest.fn().mockResolvedValue(new Response('', { status: 500 })))
    await expect(withFetch.readAsync(event('comment_added', STORY_EVENT.data), { botUsername: null, credentials: { type: 'token', token: 'pat' } })).rejects.toThrow('500')
  })
})
