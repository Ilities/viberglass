import type { Secret } from '@/service/api/secret-api'
import { filterSecretsForAgent, getApplicableSecretNames } from './agentSecrets'

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
  test('includes qwen API key aliases in applicable names', () => {
    const names = getApplicableSecretNames('qwen-cli', 'api_key')
    expect(names).toEqual(
      expect.arrayContaining(['QWEN_CLI_API_KEY', 'DASHSCOPE_API_KEY', 'QWEN_API_KEY']),
    )
  })

  test('adds CODEX_AUTH_JSON for codex device auth modes', () => {
    const names = getApplicableSecretNames('codex', 'chatgpt_device')
    expect(names).toContain('CODEX_AUTH_JSON')
  })

  test('filters secrets by selected agent names', () => {
    const secrets: Secret[] = [
      createSecret('s1', 'QWEN_CLI_API_KEY'),
      createSecret('s2', 'QWEN_API_ENDPOINT'),
      createSecret('s3', 'OPENAI_API_KEY'),
      createSecret('s4', 'UNRELATED_SECRET'),
    ]

    const filtered = filterSecretsForAgent(secrets, 'qwen-cli', 'api_key')
    expect(filtered.map((secret) => secret.id)).toEqual(['s1'])
  })
})
