import type { Secret } from '@/service/api/secret-api'
import { applySecretSelection, defaultEnvVarForSecret, describeBindingsProblem } from './agentSecrets'

function createSecret(id: string, name: string): Secret {
  return {
    id,
    name,
    secretLocation: 'env',
    secretPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('agentSecrets', () => {
  const teamKey: Secret = { ...createSecret('k1', 'Team Anthropic key'), provider: 'anthropic' }
  const legacy = createSecret('k2', 'OPENAI_API_KEY')
  const notion = createSecret('k3', 'Notion workspace')

  test('a model key starts out as the env var the agent reads for its provider', () => {
    expect(defaultEnvVarForSecret(teamKey, 'claude-code')).toBe('ANTHROPIC_API_KEY')
  })

  test('a secret whose label is an env var name keeps it', () => {
    expect(defaultEnvVarForSecret(legacy, 'codex')).toBe('OPENAI_API_KEY')
  })

  test('any other secret starts as its label in env var form', () => {
    expect(defaultEnvVarForSecret(notion, 'claude-code')).toBe('NOTION_WORKSPACE')
    expect(defaultEnvVarForSecret(createSecret('k4', '2nd key!'), 'claude-code')).toBe('_2ND_KEY')
  })

  test('keeps edited env vars when the selection changes', () => {
    const bindings = [{ secretId: 'k1', envVar: 'ANTHROPIC_AUTH_TOKEN' }]
    expect(applySecretSelection(bindings, ['k1', 'k2'], [teamKey, legacy], 'claude-code')).toEqual([
      { secretId: 'k1', envVar: 'ANTHROPIC_AUTH_TOKEN' },
      { secretId: 'k2', envVar: 'OPENAI_API_KEY' },
    ])
    expect(applySecretSelection(bindings, ['k2'], [teamKey, legacy], 'claude-code')).toEqual([
      { secretId: 'k2', envVar: 'OPENAI_API_KEY' },
    ])
  })

  test('flags invalid and repeated env vars', () => {
    expect(describeBindingsProblem([{ secretId: 'k1', envVar: 'my key' }])).toContain("isn't a valid")
    expect(
      describeBindingsProblem([
        { secretId: 'k1', envVar: 'ANTHROPIC_API_KEY' },
        { secretId: 'k2', envVar: 'ANTHROPIC_API_KEY' },
      ]),
    ).toContain('Two secrets')
    expect(describeBindingsProblem([{ secretId: 'k1', envVar: 'ANTHROPIC_API_KEY' }])).toBeNull()
  })
})
