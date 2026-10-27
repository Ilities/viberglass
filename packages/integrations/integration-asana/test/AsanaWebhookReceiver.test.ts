import crypto from 'crypto'
import { AsanaWebhookReceiver } from '../src/backend/AsanaWebhookReceiver'

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const TASK_EVENT = {
  events: [
    {
      user: { gid: 'user-1', resource_type: 'user', name: 'Alice Reporter' },
      resource: { gid: '1200', resource_type: 'task', name: 'Broken login' },
      type: 'task',
      action: 'added',
      parent: { gid: '900', resource_type: 'project', name: 'Web' },
      created_at: '2026-10-27T09:00:00.000Z',
    },
  ],
}

const STORY_EVENT = {
  events: [
    {
      user: { gid: 'user-2', resource_type: 'user', name: 'Pat Commenter' },
      resource: { gid: '3300', resource_type: 'story' },
      type: 'story',
      action: 'added',
      parent: { gid: '1200', resource_type: 'task' },
      created_at: '2026-10-27T09:05:00.000Z',
    },
  ],
}

const CONFIG = { type: 'token' as const, token: 'pat-1' }
const TASK = {
  gid: '1200',
  name: 'Broken login',
  notes: 'Users cannot sign in.',
  completed: false,
  permalink_url: 'https://app.asana.com/0/900/1200',
  created_by: { gid: 'user-1', name: 'Alice Reporter', email: 'alice@example.com' },
  projects: [{ gid: '900', name: 'Web' }],
  tags: [{ name: 'Bug' }, { name: 'Customer' }],
}
const COMMENT = {
  text: '@Viberglass please look at this',
  type: 'comment',
  resource_subtype: 'comment_added',
  created_by: { gid: 'user-2', name: 'Pat Commenter', email: 'pat@example.com' },
  target: { gid: '1200', resource_type: 'task' },
}

describe('AsanaWebhookReceiver', () => {
  const receiver = new AsanaWebhookReceiver()
  let fetchMock: jest.SpyInstance

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchMock.mockRestore()
  })

  it('parses a task added to a project', () => {
    const event = receiver.parseEvent(TASK_EVENT, {})

    expect(event.eventType).toBe('task_added')
    expect(event.timestamp).toBe('2026-10-27T09:00:00.000Z')
    expect(event.metadata).toEqual({
      action: 'added',
      issueKey: '1200',
      commentId: undefined,
      projectId: '900',
      sender: 'Alice Reporter',
    })
    expect(event.deduplicationId).toBe(receiver.parseEvent(TASK_EVENT, {}).deduplicationId)
  })

  it('parses a comment story on a task', () => {
    const event = receiver.parseEvent(STORY_EVENT, {})

    expect(event.eventType).toBe('story_added')
    expect(event.metadata).toEqual(expect.objectContaining({ issueKey: '1200', commentId: '3300', action: 'added' }))
  })

  it('reads an empty delivery as Asana heartbeat and rejects a payload that is not an event batch', () => {
    expect(receiver.parseEvent({ events: [] }, {}).eventType).toBe('heartbeat')
    expect(() => receiver.parseEvent({ nope: true }, {})).toThrow('events array')
  })

  it('reads a task into an issue with its project and tags', async () => {
    const event = receiver.parseEvent(TASK_EVENT, {})
    fetchMock.mockResolvedValue(response(200, { data: TASK }))

    const action = await receiver.read(event, { botUsername: null, config: CONFIG })

    expect(action).toEqual({
      kind: 'issue',
      issue: expect.objectContaining({
        key: '1200',
        url: 'https://app.asana.com/0/900/1200',
        title: 'Broken login',
        description: 'Users cannot sign in.',
        author: { name: 'Alice Reporter', email: 'alice@example.com', accountId: 'user-1' },
        severity: 'medium',
        labels: ['bug', 'customer'],
        metadata: { asanaProjectGid: '900', asanaProjectName: 'Web', completed: false },
      }),
    })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/tasks/1200?opt_fields='), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer pat-1' }) }))
  })

  it('closes and reopens a task from the completed field change', async () => {
    const base = TASK_EVENT.events[0]
    const closed = receiver.parseEvent(
      { events: [{ ...base, action: 'changed', change: { field: 'completed', action: 'changed', new_value: true } }] },
      {},
    )
    const reopened = receiver.parseEvent(
      { events: [{ ...base, action: 'changed', change: { field: 'completed', action: 'changed', new_value: false } }] },
      {},
    )
    fetchMock.mockImplementation(async () => response(200, { data: { ...TASK, completed: true } }))

    await expect(receiver.read(closed, { botUsername: null, config: CONFIG })).resolves.toEqual(
      expect.objectContaining({ issue: expect.objectContaining({ stateChange: 'closed' }) }),
    )
    await expect(receiver.read(reopened, { botUsername: null, config: CONFIG })).resolves.toEqual(
      expect.objectContaining({ issue: expect.objectContaining({ stateChange: 'reopened' }) }),
    )
  })

  it('reads a comment story as a comment and takes the bot mention out', async () => {
    const event = receiver.parseEvent(STORY_EVENT, {})
    fetchMock.mockResolvedValue(response(200, { data: COMMENT }))

    const action = await receiver.read(event, { botUsername: 'Viberglass', config: CONFIG })

    expect(action).toEqual({
      kind: 'comment',
      comment: {
        issueKey: '1200',
        author: { name: 'Pat Commenter', email: 'pat@example.com', accountId: 'user-2' },
        body: 'please look at this',
        mentionsBot: true,
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/stories/3300?opt_fields='), expect.anything())
  })

  it('ignores a comment written by the bot and a system story', async () => {
    const event = receiver.parseEvent(STORY_EVENT, {})
    fetchMock.mockResolvedValue(response(200, { data: { ...COMMENT, created_by: { gid: 'b1', name: 'Viberglass' } } }))

    await expect(receiver.read(event, { botUsername: 'Viberglass', config: CONFIG })).resolves.toEqual({ kind: 'ignored', reason: 'Written by the bot account' })

    fetchMock.mockResolvedValue(response(200, { data: { ...COMMENT, type: 'system' } }))
    await expect(receiver.read(event, { botUsername: null, config: CONFIG })).resolves.toEqual({ kind: 'ignored', reason: "Asana's story isn't a comment" })
  })

  it('reads every event in a batched delivery', async () => {
    const event = receiver.parseEvent({ events: [...TASK_EVENT.events, ...STORY_EVENT.events] }, {})
    fetchMock
      .mockResolvedValueOnce(response(200, { data: TASK }))
      .mockResolvedValueOnce(response(200, { data: COMMENT }))

    const actions = await receiver.readAll?.(event, { botUsername: 'Viberglass', config: CONFIG })

    expect(actions).toEqual([
      expect.objectContaining({ kind: 'issue' }),
      expect.objectContaining({ kind: 'comment' }),
    ])
  })

  it('ignores an event when the connection has no token', async () => {
    const event = receiver.parseEvent(TASK_EVENT, {})

    await expect(receiver.read(event, { botUsername: null })).resolves.toEqual({
      kind: 'ignored',
      reason: 'The Asana connection has no personal access token',
    })
  })

  it('verifies X-Hook-Signature and answers the X-Hook-Secret handshake', () => {
    const rawBody = Buffer.from(JSON.stringify(TASK_EVENT))
    const secret = 'asana-secret'
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

    expect(receiver.signatureOf({ 'x-hook-signature': signature })).toBe(signature)
    expect(receiver.verifySignature(rawBody, signature, secret)).toBe(true)
    expect(receiver.verifySignature(rawBody, signature, 'wrong')).toBe(false)
    expect(receiver.handshake({ 'x-hook-secret': secret })).toEqual({ 'X-Hook-Secret': secret })
    expect(receiver.handshake({})).toBeNull()
    expect(receiver.retryHeaders({ deliveryId: 'delivery-1', eventType: 'task_added' })).toEqual({
      'x-asana-delivery': 'delivery-1',
      'x-asana-event-type': 'task_added',
    })
    expect(receiver.targetsOneSpace).toBe(false)
  })
})
