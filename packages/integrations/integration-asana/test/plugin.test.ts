import { AsanaCommenter } from '../src/backend/AsanaCommenter'
import { AsanaWebhookReceiver } from '../src/backend/AsanaWebhookReceiver'
import asanaPlugin from '../src/backend/plugin'
import frontendPlugin from '../src/frontend/plugin'

describe('Asana plugin', () => {
  it('describes itself for the connections page', () => {
    expect(asanaPlugin.id).toBe('asana')
    expect(asanaPlugin.label).toBe('Asana')
    expect(asanaPlugin.category).toBe('ticketing')
    expect(asanaPlugin.status).toBe('ready')
    expect(asanaPlugin.description).toBeTruthy()
    expect(asanaPlugin.credentialUse).toContain('personal access token')
    expect(asanaPlugin.receivesWebhooks).toBe(true)
    expect(asanaPlugin.defaultInboundEvents).toEqual(['task_added', 'task_changed', 'story_added'])
  })

  it('adds the tracker capabilities and the webhook descriptor', () => {
    expect(asanaPlugin.checkConnection).toEqual(expect.any(Function))
    expect(asanaPlugin.createCommenter?.({ type: 'token', token: 'pat-1' })).toBeInstanceOf(AsanaCommenter)
    expect(asanaPlugin.webhook).toBeInstanceOf(AsanaWebhookReceiver)
    expect(frontendPlugin.trackerWebhook?.tracker).toBe('Asana')
    expect(frontendPlugin.Icon).toEqual(expect.any(Function))
  })
})
