import crypto from 'crypto'
import type { InboundWebhookEvent } from '@viberglass/integration-core'
import { GitHubWebhookReceiver } from '../src/backend/webhook/GitHubWebhookReceiver'

const receiver = new GitHubWebhookReceiver()

const issue = {
  number: 42,
  title: 'Broken flow',
  state: 'open',
  html_url: 'https://github.com/acme/repo/issues/42',
  user: { login: 'alice' },
  created_at: '2026-02-10T00:00:00.000Z',
  updated_at: '2026-02-10T00:00:00.000Z',
}
const repository = { id: 1, name: 'repo', full_name: 'acme/repo', owner: { login: 'acme' }, private: false }

function event(eventType: string, payload: unknown): InboundWebhookEvent {
  return { eventType, deduplicationId: 'd-1', timestamp: '2026-10-07T00:00:00.000Z', payload, metadata: {} }
}

describe('GitHubWebhookReceiver', () => {
  it('parses issues webhook as an action-scoped event', () => {
    const parsed = receiver.parseEvent(
      { action: 'opened', issue, repository, sender: { login: 'alice', id: 7 } },
      { 'x-github-event': 'issues', 'x-github-delivery': 'delivery-1' },
    )

    expect(parsed.eventType).toBe('issues.opened')
    expect(parsed.deduplicationId).toBe('delivery-1')
    expect(parsed.metadata).toEqual(
      expect.objectContaining({ repositoryId: 'acme/repo', issueKey: '42', action: 'opened', sender: 'alice' }),
    )
  })

  it('parses issue_comment webhook as an action-scoped event', () => {
    const parsed = receiver.parseEvent(
      {
        action: 'created',
        issue,
        comment: {
          id: 99,
          body: '@viberator fix this',
          user: { login: 'bob' },
          created_at: '2026-02-10T00:00:00.000Z',
          updated_at: '2026-02-10T00:00:00.000Z',
        },
        repository,
        sender: { login: 'bob', id: 9 },
      },
      { 'x-github-event': 'issue_comment', 'x-github-delivery': 'delivery-2' },
    )

    expect(parsed.eventType).toBe('issue_comment.created')
    expect(parsed.metadata).toEqual(
      expect.objectContaining({ repositoryId: 'acme/repo', issueKey: '42', commentId: '99', action: 'created', sender: 'bob' }),
    )
  })

  it('enforces required payload fields for supported events', () => {
    const parse = () =>
      receiver.parseEvent(
        { action: 'opened', issue: { number: 42 } },
        { 'x-github-event': 'issues', 'x-github-delivery': 'delivery-3' },
      )
    expect(parse).toThrow("Missing required field 'repository.full_name'")
  })

  it('verifies valid HMAC signatures against raw bytes', () => {
    const rawBody = Buffer.from('{"action":"opened"}')
    const secret = 'super-secret'
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`

    expect(receiver.verifySignature(rawBody, signature, secret)).toBe(true)
    expect(receiver.verifySignature(rawBody, signature, 'wrong-secret')).toBe(false)
  })

  it('reads the signature header and rebuilds the event headers for a retry', () => {
    expect(receiver.signatureOf({ 'x-hub-signature-256': 'sha256=abc', 'x-hub-signature': 'sha1=def' })).toBe('sha256=abc')
    expect(receiver.signatureOf({ 'x-hub-signature': 'sha1=def' })).toBe('sha1=def')
    expect(receiver.retryHeaders({ deliveryId: 'delivery-1', eventType: 'issues.opened' })).toEqual({
      'x-github-event': 'issues',
      'x-github-delivery': 'delivery-1',
    })
  })

  it('passes a GitHub issue on with its repository and labels, and skips comments from bots', () => {
    const repo = { full_name: 'acme/shop' }
    const read = receiver.read(
      event('issues', { action: 'labeled', repository: repo, issue: { number: 7, title: 'New title', body: 'New body', labels: [{ name: 'Ready' }] } }),
      { botUsername: 'viberator' },
    )
    const bot = receiver.read(
      event('issue_comment', { action: 'created', repository: repo, issue: { number: 7 }, comment: { body: 'Ship it', user: { login: 'ci', type: 'Bot' } } }),
      { botUsername: 'viberator' },
    )

    expect(read).toEqual({
      kind: 'issue',
      issue: expect.objectContaining({ key: 'acme/shop#7', title: 'New title', description: 'New body', labels: ['ready'], repository: 'acme/shop' }),
    })
    expect(bot).toEqual({ kind: 'ignored', reason: 'Written by a bot account' })
  })

  it("passes a person's comment on, taking out the bot's mention", () => {
    const read = receiver.read(
      event('issue_comment.created', { action: 'created', repository: { full_name: 'acme/shop' }, issue: { number: 7 }, comment: { body: '@viberator, fix this', user: { login: 'bob' } } }),
      { botUsername: 'viberator' },
    )

    expect(read).toEqual({
      kind: 'comment',
      comment: { issueKey: 'acme/shop#7', author: { name: 'bob', email: null }, body: 'fix this', mentionsBot: true },
    })
  })
})
