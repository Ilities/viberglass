import type { Secret } from '@/service/api/secret-api'
import { buildSecretPickerOptions, filterSecretsForAgent, getAllSecrets, getApplicableSecretNames, getSecretPickerDescription, getSecretPickerEmptyMessage } from './agentSecrets'

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
  test('lists the names the agent plugin reads, key first', () => {
    expect(getApplicableSecretNames('claude-code', 'api_key')).toEqual([
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_BASE_URL',
    ])
  })

  test('includes every provider key a multi-provider agent reads', () => {
    expect(getApplicableSecretNames('opencode', 'api_key')).toEqual(
      expect.arrayContaining(['OPENCODE_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'XAI_API_KEY', 'GROQ_API_KEY']),
    )
  })

  test('adds CODEX_AUTH_JSON for codex device auth modes', () => {
    const names = getApplicableSecretNames('codex', 'chatgpt_device')
    expect(names).toContain('CODEX_AUTH_JSON')
  })

  test('filters secrets by selected agent names', () => {
    const secrets: Secret[] = [
      createSecret('s1', 'QWEN_CLI_API_KEY'),
      createSecret('s2', 'QWEN_API_KEY'),
      createSecret('s3', 'OPENAI_API_KEY'),
      createSecret('s4', 'UNRELATED_SECRET'),
    ]

    const filtered = filterSecretsForAgent(secrets, 'qwen-cli', 'api_key')
    expect(filtered.map((secret) => secret.id)).toEqual(['s1'])
  })

  describe('buildSecretPickerOptions', () => {
    const anthropic = createSecret('s1', 'ANTHROPIC_API_KEY')
    const openai = createSecret('s2', 'OPENAI_API_KEY')

    test('keeps a selected secret the agent does not read, flagged', () => {
      const options = buildSecretPickerOptions([anthropic, openai], [openai], ['s1'], 'codex')
      expect(options.map((option) => option.id)).toEqual(['s2', 's1'])
      expect(options[1].description).toContain('not read by OpenAI Codex')
    })

    test('does not list unselected secrets outside the selectable ones', () => {
      const options = buildSecretPickerOptions([anthropic, openai], [openai], [], 'codex')
      expect(options.map((option) => option.id)).toEqual(['s2'])
    })
  })

  describe('getAllSecrets', () => {
    test('returns all secrets without filtering', () => {
      const secrets: Secret[] = [
        createSecret('s1', 'QWEN_CLI_API_KEY'),
        createSecret('s2', 'CUSTOM_SECRET'),
        createSecret('s3', 'OPENAI_API_KEY'),
        createSecret('s4', 'UNRELATED_SECRET'),
      ]

      const result = getAllSecrets(secrets)
      expect(result).toEqual(secrets)
      expect(result).toHaveLength(4)
    })

    test('returns empty array when no secrets exist', () => {
      const result = getAllSecrets([])
      expect(result).toEqual([])
    })
  })

  describe('getSecretPickerDescription', () => {
    test('includes note about showing all secrets when showAllSecrets is true', () => {
      const description = getSecretPickerDescription('claude-code', 'api_key', true)
      expect(description).toContain('Showing all configured secrets')
    })

    test('does not include all secrets note when showAllSecrets is false', () => {
      const description = getSecretPickerDescription('claude-code', 'api_key', false)
      expect(description).not.toContain('Showing all configured secrets')
    })

    test('defaults to not showing all secrets when parameter is omitted', () => {
      const description = getSecretPickerDescription('claude-code', 'api_key')
      expect(description).not.toContain('Showing all configured secrets')
    })
  })

  describe('getSecretPickerEmptyMessage', () => {
    test('returns specific message when showAllSecrets is true and no secrets exist', () => {
      const message = getSecretPickerEmptyMessage('claude-code', 'api_key', true)
      expect(message).toContain('No secrets configured')
      expect(message).toContain('Add secrets in the Secrets page')
    })

    test('suggests enabling show all secrets when filtered list is empty', () => {
      const message = getSecretPickerEmptyMessage('claude-code', 'api_key', false)
      expect(message).toContain('enable "Show all secrets"')
    })

    test('suggests creating secrets with agent-specific names when showAllSecrets is false', () => {
      const message = getSecretPickerEmptyMessage('claude-code', 'api_key', false)
      expect(message).toContain('Create one with name like')
      expect(message).toContain('ANTHROPIC_API_KEY')
    })
  })
})
