import asanaPlugin from '../src/backend/plugin'

describe('Asana plugin', () => {
  it('describes itself and declares the tracker capabilities', () => {
    expect(asanaPlugin.id).toBe('asana')
    expect(asanaPlugin.category).toBe('ticketing')
    expect(asanaPlugin.receivesWebhooks).toBe(true)
    expect(asanaPlugin.checkConnection).toBeDefined()
    expect(asanaPlugin.createCommenter).toBeDefined()
    expect(asanaPlugin.webhook?.targetsOneSpace).toBe(false)
  })

  it('subscribes new webhooks to the task and comment events it reads', () => {
    expect(asanaPlugin.defaultInboundEvents).toEqual(['task_added', 'task_changed', 'story_added'])
  })
})
