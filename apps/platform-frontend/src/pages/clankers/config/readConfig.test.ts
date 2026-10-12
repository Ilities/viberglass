import { readClankerDeploymentConfig } from './readConfig'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from './types'

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
    })

    expect(result.form.values).toEqual({ opencode: { endpoint: 'https://openrouter.ai/api/v1', model: 'openai/gpt-5' } })
  })

  test('reads only the settings the harness declares', () => {
    const result = readClankerDeploymentConfig({
      deploymentConfig: {
        version: 1,
        strategy: { type: 'docker' },
        agent: { type: 'claude-code', endpoint: 'https://api.openai.com/v1', model: 'gpt-5-codex' },
      },
    })

    expect(result.form.values).toEqual({ 'claude-code': {} })
  })

  test('reads how Codex signs in', () => {
    const result = readClankerDeploymentConfig({
      deploymentConfig: {
        version: 1,
        strategy: { type: 'docker' },
        agent: { type: 'codex', codexAuth: { mode: 'chatgpt_device_stored', secretName: 'CODEX_AUTH_JSON', loginSecretId: 'login-1' } },
      },
    })

    expect(result.form).toMatchObject({ codexAuthMode: 'chatgpt_device_stored', codexLoginSecretId: 'login-1' })
  })

  test('gives a runner saved without a config the defaults', () => {
    const result = readClankerDeploymentConfig({ deploymentConfig: { endpoint: 'https://api.openai.com/v1' } })

    expect(result.form).toEqual(DEFAULT_CLANKER_CONFIG_FORM_STATE)
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
    })

    expect(result.form.lambdaMemorySize).toBe('')
    expect(result.form.lambdaTimeout).toBe('')
  })
})

test('reads Kubernetes image and resource bounds for editing', () => {
  const result = readClankerDeploymentConfig({ deploymentConfig: { version: 1, strategy: { type: 'kubernetes', containerImage: 'worker:1', cpu: '250m', memory: '512Mi', ephemeralStorage: '2Gi', activeDeadlineSeconds: 120 }, agent: { type: 'opencode' } } })
  expect(result.form).toMatchObject({ containerImage: 'worker:1', kubernetesCpu: '250m', kubernetesMemory: '512Mi', kubernetesStorage: '2Gi', kubernetesDeadline: '120' })
})
