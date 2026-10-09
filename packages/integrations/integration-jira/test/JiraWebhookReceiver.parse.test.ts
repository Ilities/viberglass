import crypto from 'crypto'
import { JiraWebhookReceiver } from '../src/backend/JiraWebhookReceiver'

describe('JiraWebhookReceiver parsing and signatures', () => {
  const receiver = new JiraWebhookReceiver()

  it('parses issue_created events with Jira project and reporter metadata', () => {
    const timestamp = Date.parse('2026-02-10T10:00:00.000Z')
    const event = receiver.parseEvent(
      {
        webhookEvent: 'jira:issue_created',
        timestamp,
        issue: {
          key: 'PROJ-123',
          fields: {
            summary: 'Broken login',
            issuetype: { id: '10000', name: 'Bug' },
            project: { id: '10001', key: 'PROJ' },
            reporter: { accountId: 'abc', displayName: 'Alice Reporter' },
            status: { id: '3', name: 'To Do' },
            created: '2026-02-10T10:00:00.000Z',
            updated: '2026-02-10T10:00:00.000Z',
          },
        },
        user: { self: 'https://jira.example.com/user/abc', accountId: 'abc', displayName: 'Alice Reporter' },
      },
      { 'x-atlassian-webhook-identifier': 'jira-delivery-1' },
    )

    expect(event.eventType).toBe('issue_created')
    expect(event.deduplicationId).toBe('jira-delivery-1')
    expect(event.timestamp).toBe('2026-02-10T10:00:00.000Z')
    expect(event.metadata).toEqual(
      expect.objectContaining({
        repositoryId: 'PROJ',
        projectId: '10001',
        issueKey: 'PROJ-123',
        sender: 'Alice Reporter',
      }),
    )
  })

  it('normalizes Jira issue_commented updates to comment_created', () => {
    const event = receiver.parseEvent(
      {
        webhookEvent: 'jira:issue_updated',
        issue_event_type_name: 'issue_commented',
        timestamp: Date.parse('2026-02-10T10:00:00.000Z'),
        issue: {
          key: 'OPS-42',
          fields: {
            summary: 'Service outage',
            issuetype: { id: '10000', name: 'Bug' },
            reporter: { accountId: 'rep-1', displayName: 'Reporter' },
            project: { key: 'OPS' },
            status: { id: '1', name: 'Open' },
            created: '2026-02-10T10:00:00.000Z',
            updated: '2026-02-10T10:01:00.000Z',
          },
        },
        comment: {
          id: '9001',
          self: 'https://jira.example.com/comment/9001',
          author: { accountId: 'c-1', displayName: 'Bob Commenter' },
          body: 'please fix this',
          created: '2026-02-10T10:01:00.000Z',
          updated: '2026-02-10T10:01:00.000Z',
        },
      },
      { 'x-atlassian-webhook-identifier': 'jira-delivery-2' },
    )

    expect(event.eventType).toBe('comment_created')
    expect(event.metadata).toEqual(
      expect.objectContaining({
        repositoryId: 'OPS',
        issueKey: 'OPS-42',
        commentId: '9001',
        action: 'issue_commented',
        sender: 'Bob Commenter',
      }),
    )
  })

  it('throws when issue key is missing for supported Jira issue events', () => {
    const parse = () =>
      receiver.parseEvent(
        {
          webhookEvent: 'jira:issue_created',
          issue: {
            fields: {
              summary: 'Broken login',
              issuetype: { id: '10000', name: 'Bug' },
              project: { key: 'PROJ' },
              reporter: { accountId: 'abc', displayName: 'Alice Reporter' },
              status: { id: '3', name: 'To Do' },
              created: '2026-02-10T10:00:00.000Z',
              updated: '2026-02-10T10:00:00.000Z',
            },
          },
        },
        { 'x-atlassian-webhook-identifier': 'jira-delivery-3' },
      )
    expect(parse).toThrow("Missing required field 'issue.key'")
  })

  it('verifies valid HMAC signatures against raw bytes', () => {
    const rawBody = Buffer.from('{"webhookEvent":"jira:issue_created"}')
    const secret = 'super-secret'
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`

    expect(receiver.verifySignature(rawBody, signature, secret)).toBe(true)
    expect(receiver.verifySignature(rawBody, signature, 'wrong-secret')).toBe(false)
  })

  it('rejects malformed Jira signatures', () => {
    const rawBody = Buffer.from('{"webhookEvent":"jira:issue_created"}')
    expect(receiver.verifySignature(rawBody, 'sha256=not-hex', 'secret')).toBe(false)
  })

  it("reads the signature from Atlassian's header, or the hub header", () => {
    expect(receiver.signatureOf({ 'x-atlassian-webhook-signature': 'a', 'x-hub-signature': 'b' })).toBe('a')
    expect(receiver.signatureOf({ 'x-hub-signature': 'b' })).toBe('b')
    expect(receiver.signatureOf({})).toBeUndefined()
  })

  it('carries the delivery id in the header a retry is parsed from', () => {
    const headers = receiver.retryHeaders({ deliveryId: 'jira-delivery-4', eventType: 'issue_created' })
    expect(headers).toEqual({ 'x-atlassian-webhook-identifier': 'jira-delivery-4' })
    const event = receiver.parseEvent(
      { webhookEvent: 'jira:issue_created', issue: { key: 'OPS-1', fields: { summary: 'Retry me' } } },
      headers,
    )
    expect(event.deduplicationId).toBe('jira-delivery-4')
  })

  it('is a tracker webhook rather than one per space', () => {
    expect(receiver.targetsOneSpace).toBe(false)
  })
})
