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

  it('matches a rich-text mention of the bot by account ID, whatever its display text', () => {
    const paragraph = (...content: unknown[]) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content }] })
    const mention = (id: string, text: string) => ({ type: 'mention', attrs: { id, text, accessLevel: '' } })
    const read = (body: unknown) =>
      receiver.read(event({ eventType: 'comment_created', metadata: {}, payload: { issue: { key: 'OPS-1' }, comment: { body, author: { displayName: 'Maria' } } } }), {
        botUsername: '712020:bot-account',
      })

    expect(read(paragraph(mention('712020:bot-account', '@Viberglass Bot'), { type: 'text', text: ' write the plan' }))).toEqual({
      kind: 'comment',
      comment: { issueKey: 'OPS-1', author: { name: 'Maria', email: null }, body: 'write the plan', mentionsBot: true },
    })
    expect(read(paragraph(mention('712020:someone-else', '@Pat'), { type: 'text', text: ' can you look?' }))).toEqual({
      kind: 'comment',
      comment: { issueKey: 'OPS-1', author: { name: 'Maria', email: null }, body: '@Pat can you look?', mentionsBot: false },
    })
  })

  describe('closing and reopening', () => {
    const updated = (items: unknown[], category = 'indeterminate') =>
      receiver.read(
        event({
          eventType: 'issue_updated',
          metadata: { action: 'issue_generic' },
          payload: {
            webhookEvent: 'jira:issue_updated',
            changelog: { id: '10040', items },
            issue: { key: 'KAN-4', fields: { summary: 'Add Nemotron models', status: { name: 'Status', statusCategory: { key: category } } } },
          },
        }),
        settings,
      )
    const stateChangeOf = (action: ReturnType<typeof updated>) => (action.kind === 'issue' ? action.issue.stateChange : `not an issue: ${action.kind}`)
    const status = (fromString: string, toString: string) => ({ field: 'status', fieldId: 'status', from: '1', fromString, to: '2', toString })

    it('closes when the resolution is set, or the issue moves into a done status', () => {
      expect(stateChangeOf(updated([status('In Progress', 'Done'), { field: 'resolution', fieldId: 'resolution', from: null, fromString: null, to: '10000', toString: 'Done' }], 'done'))).toBe('closed')
      expect(stateChangeOf(updated([status('In Progress', 'Done')], 'done'))).toBe('closed')
    })

    it('reopens when the resolution is cleared', () => {
      expect(stateChangeOf(updated([status('Done', 'To Do'), { field: 'resolution', fieldId: 'resolution', from: '10000', fromString: 'Done', to: null, toString: null }], 'new'))).toBe('reopened')
    })

    it('leaves moves between open statuses and other changes alone', () => {
      expect(stateChangeOf(updated([status('To Do', 'In Progress')]))).toBeUndefined()
      expect(stateChangeOf(updated([{ field: 'labels', fieldId: 'labels', fromString: '', toString: 'viberglass' }], 'done'))).toBeUndefined()
    })
  })
})
