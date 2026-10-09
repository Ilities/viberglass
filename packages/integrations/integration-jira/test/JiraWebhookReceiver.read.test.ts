import type { InboundWebhookEvent } from '@viberglass/integration-core'
import { JiraWebhookReceiver } from '../src/backend/JiraWebhookReceiver'

function event(fields: Pick<InboundWebhookEvent, 'eventType' | 'metadata' | 'payload'>): InboundWebhookEvent {
  return { deduplicationId: 'd-1', timestamp: '2026-10-07T00:00:00.000Z', ...fields }
}

describe('JiraWebhookReceiver reading', () => {
  const receiver = new JiraWebhookReceiver()
  const settings = { botUsername: 'viberator' }

  it("passes a Jira comment on as a message, with the commenter's email to match them", () => {
    const action = receiver.read(
      event({
        eventType: 'comment_created',
        metadata: {},
        payload: {
          issue: { key: 'OPS-1' },
          comment: { body: 'Can we keep the old flow?', author: { displayName: 'Maria', emailAddress: 'maria@acme.test', accountId: 'u-1' } },
        },
      }),
      settings,
    )
    expect(action).toEqual({
      kind: 'comment',
      comment: { issueKey: 'OPS-1', author: { name: 'Maria', email: 'maria@acme.test' }, body: 'Can we keep the old flow?', mentionsBot: false },
    })
  })

  it("leaves out Jira's repeat of a comment as an issue update, and the bot's own comments", () => {
    const repeat = receiver.read(
      event({ eventType: 'comment_created', metadata: { action: 'issue_commented' }, payload: { issue: { key: 'OPS-1' }, comment: { body: 'Hi' } } }),
      settings,
    )
    const own = receiver.read(
      event({ eventType: 'comment_created', metadata: {}, payload: { issue: { key: 'OPS-1' }, comment: { body: 'Plan ready', author: { accountId: 'viberator' } } } }),
      settings,
    )
    expect(repeat.kind).toBe('ignored')
    expect(own).toEqual({ kind: 'ignored', reason: 'Written by the bot account' })
  })

  it("passes a Jira issue on with its labels, and keeps the description an update doesn't carry", () => {
    const issue = { key: 'OPS-1', self: 'https://acme.atlassian.net/rest/api/2/issue/1', fields: { summary: 'Faster checkout', labels: ['Frontend'] } }
    const action = receiver.read(event({ eventType: 'issue_updated', metadata: {}, payload: { issue } }), settings)
    expect(action).toEqual({
      kind: 'issue',
      issue: expect.objectContaining({
        key: 'OPS-1',
        title: 'Faster checkout',
        description: undefined,
        labels: ['frontend'],
        url: 'https://acme.atlassian.net/browse/OPS-1',
      }),
    })
  })
})
