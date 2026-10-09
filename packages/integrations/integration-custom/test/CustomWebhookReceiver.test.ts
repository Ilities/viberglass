import crypto from 'crypto'
import { InvalidWebhookPayloadError, type InboundWebhookEvent, type WebhookReceiver } from '@viberglass/integration-core'
import { CustomWebhookReceiver } from '../src/backend/CustomWebhookReceiver'
import customPlugin from '../src/backend/plugin'

const receiver: WebhookReceiver = new CustomWebhookReceiver()
const secret = 'custom-secret'

function hmacHex(body: Buffer, key: string): string {
  return crypto.createHmac('sha256', key).update(body).digest('hex')
}

function eventOf(payload: unknown, eventType = 'ticket_created'): InboundWebhookEvent {
  return { eventType, deduplicationId: 'delivery-1', timestamp: '2026-01-01T00:00:00.000Z', payload, metadata: {} }
}

describe('CustomWebhookReceiver', () => {
  it('is the custom plugin\'s webhook and makes tasks in one space', () => {
    expect(customPlugin.webhook).toBeInstanceOf(CustomWebhookReceiver)
    expect(receiver.targetsOneSpace).toBe(true)
  })

  describe('parseEvent', () => {
    it('uses the delivery id header to de-duplicate', () => {
      const payload = { title: 'Broken', description: 'It broke', externalId: 'EXT-1' }

      const event = receiver.parseEvent(payload, { 'x-webhook-delivery-id': 'delivery-1' })

      expect(event).toEqual({
        eventType: 'ticket_created',
        deduplicationId: 'delivery-1',
        timestamp: expect.any(String),
        payload,
        metadata: { issueKey: 'EXT-1', action: 'created' },
      })
    })

    it('generates a delivery id when the header is missing', () => {
      const payload = { title: 'Broken', description: 'It broke' }

      const first = receiver.parseEvent(payload, {})
      const second = receiver.parseEvent(payload, {})

      expect(first.deduplicationId).toMatch(/^[0-9a-f-]{36}$/)
      expect(second.deduplicationId).not.toBe(first.deduplicationId)
      expect(first.metadata).toEqual({ issueKey: undefined, action: 'created' })
    })

    it.each([
      ['title is missing', { description: 'It broke' }, 'Missing required field: title'],
      ['title is not a string', { title: 42, description: 'It broke' }, 'Missing required field: title'],
      ['title is empty', { title: '', description: 'It broke' }, 'Missing required field: title'],
      ['description is missing', { title: 'Broken' }, 'Missing required field: description'],
      ['description is not a string', { title: 'Broken', description: ['x'] }, 'Missing required field: description'],
      [
        'severity is not one of the four',
        { title: 'Broken', description: 'It broke', severity: 'urgent' },
        'Invalid severity. Must be: low, medium, high, or critical',
      ],
    ])('rejects the payload when %s', (_case, payload, message) => {
      const parse = () => receiver.parseEvent(payload, {})

      expect(parse).toThrow(InvalidWebhookPayloadError)
      expect(parse).toThrow(message)
    })

    it('accepts every valid severity', () => {
      for (const severity of ['low', 'medium', 'high', 'critical']) {
        expect(() => receiver.parseEvent({ title: 'Broken', description: 'It broke', severity }, {})).not.toThrow()
      }
    })
  })

  describe('verifySignature', () => {
    const body = Buffer.from('{  "title":"Whitespace Sensitive",\n  "description":"Raw bytes must match" }')

    it('accepts a signature of the exact raw bytes with the sha256= prefix', () => {
      expect(receiver.verifySignature(body, `sha256=${hmacHex(body, secret)}`, secret)).toBe(true)
    })

    it('accepts a signature without the prefix', () => {
      expect(receiver.verifySignature(body, hmacHex(body, secret), secret)).toBe(true)
    })

    it('rejects a signature made with another secret', () => {
      expect(receiver.verifySignature(body, `sha256=${hmacHex(body, 'other-secret')}`, secret)).toBe(false)
    })

    it('rejects a signature of different bytes', () => {
      const reformatted = Buffer.from(JSON.stringify(JSON.parse(body.toString())))
      expect(receiver.verifySignature(body, `sha256=${hmacHex(reformatted, secret)}`, secret)).toBe(false)
    })

    it('rejects a malformed signature', () => {
      expect(receiver.verifySignature(body, 'sha256=deadbeef', secret)).toBe(false)
      expect(receiver.verifySignature(body, `sha256=${'z'.repeat(64)}`, secret)).toBe(false)
      expect(receiver.verifySignature(body, '', secret)).toBe(false)
    })
  })

  describe('signatureOf and retryHeaders', () => {
    it('reads the signature from x-webhook-signature-256', () => {
      expect(receiver.signatureOf({ 'x-webhook-signature-256': 'sha256=abc' })).toBe('sha256=abc')
      expect(receiver.signatureOf({ 'x-hub-signature-256': 'sha256=abc' })).toBeUndefined()
    })

    it('replays the delivery id so a retry de-duplicates as the original', () => {
      expect(receiver.retryHeaders({ deliveryId: 'delivery-1', eventType: 'ticket_created' })).toEqual({
        'x-webhook-delivery-id': 'delivery-1',
      })
    })

    it('parses a retried delivery with the original delivery id', () => {
      const headers = receiver.retryHeaders({ deliveryId: 'delivery-1', eventType: 'ticket_created' })

      expect(receiver.parseEvent({ title: 'Broken', description: 'It broke' }, headers).deduplicationId).toBe('delivery-1')
    })
  })

  describe('read', () => {
    it('reads a created ticket as a task', () => {
      const payload = {
        title: 'Broken',
        description: 'It broke',
        severity: 'high',
        category: 'performance',
        externalId: 'EXT-1',
        url: 'https://example.com/EXT-1',
      }

      expect(receiver.read(eventOf(payload), { botUsername: null })).toEqual({
        kind: 'task',
        task: {
          title: 'Broken',
          description: 'It broke',
          severity: 'high',
          category: 'performance',
          externalId: 'EXT-1',
          url: 'https://example.com/EXT-1',
        },
      })
    })

    it('defaults severity to medium and category to bug', () => {
      const action = receiver.read(eventOf({ title: 'Broken', description: 'It broke' }), { botUsername: null })

      expect(action).toEqual({
        kind: 'task',
        task: {
          title: 'Broken',
          description: 'It broke',
          severity: 'medium',
          category: 'bug',
          externalId: undefined,
          url: undefined,
        },
      })
    })

    it('reads an unknown severity as medium', () => {
      const action = receiver.read(eventOf({ title: 'Broken', description: 'It broke', severity: 'urgent' }), {
        botUsername: null,
      })

      expect(action).toMatchObject({ kind: 'task', task: { severity: 'medium' } })
    })

    it('ignores any other event type', () => {
      const action = receiver.read(eventOf({ title: 'Broken', description: 'It broke' }, 'ticket_updated'), {
        botUsername: null,
      })

      expect(action).toEqual({ kind: 'ignored', reason: expect.stringContaining('ticket_updated') })
    })
  })
})
