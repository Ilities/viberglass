import type { InboundWebhookAction, InboundWebhookEvent } from '@viberglass/integration-core'
import { ShortcutWebhookReceiver } from '../src/backend/webhook/ShortcutWebhookReceiver'

const receiver = new ShortcutWebhookReceiver()

function event(eventType: string, payload: unknown): InboundWebhookEvent {
  return { eventType, deduplicationId: 'd-1', timestamp: '2026-10-07T00:00:00.000Z', metadata: {}, payload }
}

function labelsOf(action: InboundWebhookAction): string[] {
  if (action.kind !== 'issue') throw new Error(`Expected an issue, got ${action.kind}`)
  return action.issue.labels
}

describe('ShortcutWebhookReceiver reading', () => {
  it('asks from a Shortcut comment that mentions the bot', () => {
    const action = receiver.read(
      event('comment_created', { data: { story_id: 42, text: '@viberator write the plan', author_id: 'm-1' } }),
      { botUsername: 'viberator' },
    )
    expect(action).toEqual({
      kind: 'comment',
      comment: {
        issueKey: '42',
        author: { name: 'A Shortcut member', email: null },
        body: 'write the plan',
        mentionsBot: true,
      },
    })
  })

  it("names a Shortcut story's labels from the event's references", () => {
    const refs = [
      { id: 7, entity_type: 'label', name: 'Frontend' },
      { id: 8, entity_type: 'label', name: 'ops' },
      { id: 9, entity_type: 'workflow-state', name: 'Done' },
    ]
    const read = (payload: unknown) => labelsOf(receiver.read(event('story_updated', payload), { botUsername: null }))

    expect(read({ data: { id: 1, label_ids: [7, 8] }, refs })).toEqual(['frontend', 'ops'])
    expect(read({ data: { id: 1, label_ids: { adds: [8], removes: [7] } }, refs })).toEqual(['ops'])
    expect(read({ data: { id: 1, labels: [{ id: 3, name: 'Bug' }] } })).toEqual(['bug'])
  })

  it('names the labels of a story update, whether the label existed or was created with it', () => {
    const update = (extra: { actions?: Array<Record<string, unknown>>; references?: Array<Record<string, unknown>> }) =>
      receiver.parseEvent(
        {
          id: 'delivery-1',
          version: 'v1',
          primary_id: 40,
          member_id: 'member-1',
          actions: [
            {
              id: 40,
              entity_type: 'story',
              action: 'update',
              name: 'Add Muse Spark model',
              story_type: 'feature',
              changes: { label_ids: { adds: [41] } },
            },
            ...(extra.actions ?? []),
          ],
          ...(extra.references ? { references: extra.references } : {}),
        },
        {},
      )

    const created = update({ actions: [{ id: 41, entity_type: 'label', action: 'create', name: 'viberglass' }] })
    const existing = update({ references: [{ id: 41, entity_type: 'label', name: 'Viberglass' }] })

    expect(created.eventType).toBe('story_updated')
    expect(labelsOf(receiver.read(created, { botUsername: null }))).toEqual(['viberglass'])
    expect(labelsOf(receiver.read(existing, { botUsername: null }))).toEqual(['viberglass'])
  })
})
