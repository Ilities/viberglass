import { readClankerDeploymentConfig } from './readConfig'

describe('readClankerDeploymentConfig', () => {
  test('reads opencode endpoint and model from v1 config', () => {
    const result = readClankerDeploymentConfig({
      deploymentConfig: {
        version: 1,
        strategy: {
          type: 'docker',
          provisioningMode: 'managed',
        },
        agent: {
          type: 'opencode',
          endpoint: 'https://openrouter.ai/api/v1',
          model: 'openai/gpt-5',
        },
      },
      agent: 'opencode',
    })

    expect(result.form.opencodeEndpoint).toBe('https://openrouter.ai/api/v1')
    expect(result.form.opencodeModel).toBe('openai/gpt-5')
  })

  test('reads legacy opencode endpoint and model', () => {
    const result = readClankerDeploymentConfig({
      deploymentConfig: {
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-5-codex',
      },
      agent: 'opencode',
    })

    expect(result.form.opencodeEndpoint).toBe('https://api.openai.com/v1')
    expect(result.form.opencodeModel).toBe('gpt-5-codex')
  })

  test('does not populate opencode fields for non-opencode agents', () => {
    const result = readClankerDeploymentConfig({
      deploymentConfig: {
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-5-codex',
      },
      agent: 'claude-code',
    })

    expect(result.form.opencodeEndpoint).toBe('')
    expect(result.form.opencodeModel).toBe('')
  })
})
