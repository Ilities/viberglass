import asanaPlugin from '../src/backend/plugin'

describe('Asana plugin', () => {
  it('describes itself for the connections page', () => {
    expect(asanaPlugin.id).toBe('asana')
    expect(asanaPlugin.label).toBeTruthy()
    expect(asanaPlugin.description).toBeTruthy()
  })

  // TODO: test each capability the plugin adds: checkConnection, createCommenter, webhook, repository, chat.
})
