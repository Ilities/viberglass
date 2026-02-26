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

  test('reads lambda memorySize and timeout from v1 config', () => {
    const result = readClankerDeploymentConfig({
      deploymentConfig: {
        version: 1,
        strategy: {
          type: 'lambda',
          provisioningMode: 'managed',
          memorySize: 2048,
          timeout: 120,
        },
        agent: {
          type: 'claude-code',
        },
      },
      agent: 'claude-code',
    })

    expect(result.form.lambdaMemorySize).toBe('2048')
    expect(result.form.lambdaTimeout).toBe('120')
  })

  test('reads lambda config with empty memorySize and timeout', () => {
    const result = readClankerDeploymentConfig({
      deploymentConfig: {
        version: 1,
        strategy: {
          type: 'lambda',
          provisioningMode: 'managed',
        },
        agent: {
          type: 'claude-code',
        },
      },
      agent: 'claude-code',
    })

    expect(result.form.lambdaMemorySize).toBe('')
    expect(result.form.lambdaTimeout).toBe('')
  })

  test('does not populate lambda fields for non-lambda strategies', () => {
    const result = readClankerDeploymentConfig({
      deploymentConfig: {
        version: 1,
        strategy: {
          type: 'docker',
          provisioningMode: 'managed',
        },
        agent: {
          type: 'claude-code',
        },
      },
      agent: 'claude-code',
    })

    expect(result.form.lambdaMemorySize).toBe('')
    expect(result.form.lambdaTimeout).toBe('')
  })
})
