import __camelName__Plugin from '../src/backend/plugin'

describe('__DISPLAY_NAME__ plugin', () => {
  it('describes itself for the connections page', () => {
    expect(__camelName__Plugin.id).toBe('__name__')
    expect(__camelName__Plugin.label).toBeTruthy()
    expect(__camelName__Plugin.description).toBeTruthy()
  })

  // TODO: test each capability the plugin adds: checkConnection, createCommenter, webhook, repository, chat.
})
