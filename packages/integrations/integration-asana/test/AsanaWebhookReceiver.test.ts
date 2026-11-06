import crypto from 'crypto'
import { InvalidWebhookPayloadError } from '@viberglass/integration-core'
import { AsanaWebhookReceiver } from '../src/backend/webhook/AsanaWebhookReceiver'
import { splitAsanaEvents } from '../src/backend/webhook/parseAsanaEvent'

const TASK_ADDED = {
  user: { gid: '11', resource_type: 'user' },
  created_at: '2026-03-01T10:00:00.000Z',
  action: 'added',
  resource: { gid: '500', resource_type: 'task' },
  parent: { gid: '900', resource_type: 'project' },
}

describe('AsanaWebhookReceiver', () => {
  const receiver = new AsanaWebhookReceiver()

  it('parses a compact event into its type, sender and timestamp', () => {
    const event = receiver.parseEvent(TASK_ADDED, {})

    expect(event.eventType).toBe('task_added')
    expect(event.timestamp).toBe('2026-03-01T10:00:00.000Z')
    expect(event.metadata).toEqual(expect.objectContaining({ issueKey: '500', action: 'added', sender: '11' }))
  })

  it('gives the same event the same delivery id every time, and different ones different ids', () => {
    const again = receiver.parseEvent({ ...TASK_ADDED }, {})
    const other = receiver.parseEvent({ ...TASK_ADDED, resource: { gid: '501', resource_type: 'task' } }, {})

    expect(again.deduplicationId).toBe(receiver.parseEvent(TASK_ADDED, {}).deduplicationId)
    expect(other.deduplicationId).not.toBe(receiver.parseEvent(TASK_ADDED, {}).deduplicationId)
  })

  it('names a comment event by its story', () => {
    const event = receiver.parseEvent({ ...TASK_ADDED, resource: { gid: '777', resource_type: 'story' } }, {})
    expect(event.eventType).toBe('story_added')
    expect(event.metadata).toEqual(expect.objectContaining({ commentId: '777' }))
  })

  it('rejects an event with no resource, as the sender has to fix it', () => {
    expect(() => receiver.parseEvent({ action: 'added' }, {})).toThrow(InvalidWebhookPayloadError)
  })

  it('reads a delivery as its events, and a heartbeat as none', () => {
    expect(splitAsanaEvents({ events: [TASK_ADDED, TASK_ADDED] })).toHaveLength(2)
    expect(splitAsanaEvents({ events: [] })).toEqual([])
    expect(splitAsanaEvents({ nothing: true })).toEqual([{ nothing: true }])
  })

  it('takes the handshake secret from its header, and the signature from X-Hook-Signature', () => {
    expect(receiver.handshakeSecretOf({ 'x-hook-secret': 'abc' })).toBe('abc')
    expect(receiver.handshakeSecretOf({})).toBeUndefined()
    expect(receiver.signatureOf({ 'x-hook-signature': 'sig' })).toBe('sig')
  })

  it('verifies the HMAC-SHA256 of the raw body with the handshake secret', () => {
    const body = Buffer.from(JSON.stringify({ events: [TASK_ADDED] }))
    const signature = crypto.createHmac('sha256', 'secret-1').update(body).digest('hex')

    expect(receiver.verifySignature(body, signature, 'secret-1')).toBe(true)
    expect(receiver.verifySignature(body, signature, 'other')).toBe(false)
  })

  it('reads an enriched task into an issue, with completion as a state change', () => {
    const event = {
      ...receiver.parseEvent({ ...TASK_ADDED, action: 'changed', change: { field: 'completed', action: 'changed' } }, {}),
      payload: { ...TASK_ADDED, action: 'changed', change: { field: 'completed', action: 'changed' }, task: { name: 'Fix login', notes: 'Users cannot sign in', permalink_url: 'https://app.asana.com/0/1/500', completed: true } },
    }
    const action = receiver.read(event, { botUsername: null })

    expect(action).toEqual({
      kind: 'issue',
      issue: expect.objectContaining({
        key: '500',
        title: 'Fix login',
        description: 'Users cannot sign in',
        url: 'https://app.asana.com/0/1/500',
        stateChange: 'closed',
      }),
    })
  })

  it('reads an edit that does not touch completion without a state change', () => {
    const event = {
      ...receiver.parseEvent({ ...TASK_ADDED, action: 'changed', change: { field: 'name', action: 'changed' } }, {}),
      payload: { ...TASK_ADDED, action: 'changed', change: { field: 'name', action: 'changed' }, task: { name: 'Renamed', notes: '', completed: true } },
    }
    const action = receiver.read(event, { botUsername: null })

    expect(action.kind === 'issue' && action.issue.stateChange).toBeUndefined()
  })

  it('reads a comment on a task as a comment, with the bot mention taken out', () => {
    const event = {
      ...receiver.parseEvent({ ...TASK_ADDED, resource: { gid: '777', resource_type: 'story' } }, {}),
      payload: { ...TASK_ADDED, story: { resource_subtype: 'comment_added', text: '@Viberglass please check', created_by: { gid: '11', name: 'Jussi' }, target: { gid: '500' } } },
    }
    const action = receiver.read(event, { botUsername: 'Viberglass' })

    expect(action).toEqual({
      kind: 'comment',
      comment: { issueKey: '500', author: { name: 'Jussi', email: null, accountId: '11' }, body: 'please check', mentionsBot: true },
    })
  })

  it('ignores system stories, deleted tasks and events it does not read', () => {
    const system = { ...receiver.parseEvent({ ...TASK_ADDED, resource: { gid: '777', resource_type: 'story' } }, {}), payload: { story: { resource_subtype: 'section_changed', target: { gid: '500' } } } }
    const gone = { ...receiver.parseEvent(TASK_ADDED, {}), payload: { task: null } }
    const removed = receiver.parseEvent({ ...TASK_ADDED, action: 'removed' }, {})

    expect(receiver.read(system, { botUsername: null }).kind).toBe('ignored')
    expect(receiver.read(gone, { botUsername: null })).toEqual({ kind: 'ignored', reason: 'The Asana task is no longer available' })
    expect(receiver.read(removed, { botUsername: null })).toEqual({ kind: 'ignored', reason: "Unsupported Asana event 'task_removed'" })
  })
})
