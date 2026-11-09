import crypto from 'crypto'
import { AsanaWebhookReceiver } from '../src/backend/webhook/AsanaWebhookReceiver'

describe('AsanaWebhookReceiver', () => {
  it('echoes Asana’s handshake secret', () => {
    const receiver = new AsanaWebhookReceiver()
    expect(receiver.handshakeHeaders({ 'x-hook-secret': 'challenge' })).toEqual({ 'X-Hook-Secret': 'challenge' })
    expect(receiver.handshakeHeaders({})).toBeUndefined()
  })

  it('verifies Asana HMAC signatures of the raw delivery body', () => {
    const receiver = new AsanaWebhookReceiver()
    const body = Buffer.from('{"events":[]}')
    const signature = crypto.createHmac('sha256', 'secret').update(body).digest('hex')
    expect(receiver.verifySignature(body, signature, 'secret')).toBe(true)
    expect(receiver.verifySignature(body, signature, 'wrong')).toBe(false)
  })

  it('parses batched events and heartbeat deliveries', () => {
    const receiver = new AsanaWebhookReceiver()
    const parsed = receiver.parseEvent({ events: [{ action: 'added', created_at: '2026-01-01T00:00:00Z', resource: { gid: 'task-1', resource_type: 'task' } }] }, { 'x-request-id': 'request-1' })
    expect(parsed).toMatchObject({ eventType: 'asana_batch', payload: { events: [{ action: 'added' }] } })
    expect(receiver.parseEvent({ events: [] }, {}).payload).toMatchObject({ events: [] })
  })

  it('rejects malformed payloads', () => {
    expect(() => new AsanaWebhookReceiver().parseEvent({}, {})).toThrow('Asana webhook payload must contain an events array')
  })
})
