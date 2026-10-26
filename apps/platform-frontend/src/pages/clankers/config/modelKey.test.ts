import type { Secret } from '@/service/api/secret-api'
import { keysForProvider, providerOptionsForAgent, settingsForProvider, splitRunnerBindings } from './modelKey'

function secret(id: string, overrides: Partial<Secret> = {}): Secret {
  return {
    id,
    name: id,
    secretLocation: 'database',
    secretPath: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('modelKey', () => {
  test('offers the providers an agent can run', () => {
    expect(providerOptionsForAgent('claude-code').map((option) => option.provider)).toEqual(['anthropic'])
    expect(providerOptionsForAgent('opencode').map((option) => option.provider)).toEqual(
      expect.arrayContaining(['opencode-go', 'openrouter']),
    )
  })

  test('offers Anthropic for OpenCode and recognizes its saved key', () => {
    expect(providerOptionsForAgent('opencode')).toContainEqual(expect.objectContaining({
      provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY', model: expect.stringMatching(/^anthropic\//),
    }))
    expect(splitRunnerBindings(
      [{ envVar: 'ANTHROPIC_API_KEY', secretId: 'anthropic-key' }],
      [secret('anthropic-key', { provider: 'anthropic' })],
      'opencode',
    )).toEqual({ provider: 'anthropic', modelKey: { envVar: 'ANTHROPIC_API_KEY', secretId: 'anthropic-key' }, extras: [] })
  })

  test('splits off the model key and finds its provider from the secret', () => {
    const team = secret('team', { provider: 'openrouter' })
    const keys = splitRunnerBindings(
      [
        { envVar: 'OPENROUTER_API_KEY', secretId: 'team' },
        { envVar: 'NOTION_TOKEN', secretId: 'notion' },
      ],
      [team, secret('notion')],
      'opencode',
    )

    expect(keys).toEqual({
      provider: 'openrouter',
      modelKey: { envVar: 'OPENROUTER_API_KEY', secretId: 'team' },
      extras: [{ envVar: 'NOTION_TOKEN', secretId: 'notion' }],
    })
  })

  test('infers the provider from the variable for a key saved without one', () => {
    const keys = splitRunnerBindings([{ envVar: 'ANTHROPIC_API_KEY', secretId: 'old' }], [secret('old')], 'claude-code')
    expect(keys.provider).toBe('anthropic')
  })

  test('lists a provider’s keys plus the one already chosen', () => {
    const secrets = [secret('a', { provider: 'anthropic' }), secret('b', { provider: 'openai' }), secret('c')]
    expect(keysForProvider(secrets, 'anthropic', 'c').map((s) => s.id)).toEqual(['a', 'c'])
  })

  test('switching provider replaces defaults but keeps a model typed by hand', () => {
    const option = (provider: string) => {
      const found = providerOptionsForAgent('opencode').find((candidate) => candidate.provider === provider)
      if (!found) throw new Error(`OpenCode no longer runs ${provider}`)
      return found
    }
    const [go, router] = [option('opencode-go'), option('openrouter')]

    const fromDefault = settingsForProvider('opencode', { model: go.model ?? '' }, go, router)
    expect(fromDefault).toEqual({ model: router.model, endpoint: '' })

    const typed = settingsForProvider('opencode', { model: 'mine/model' }, go, router)
    expect(typed).toEqual({ endpoint: '' })

    const oldProviders = settingsForProvider('opencode', { model: 'opencode-go/kimi-k3' }, go, router)
    expect(oldProviders.model).toBe(router.model)
  })
})
