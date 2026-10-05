import { buildClankerDeploymentConfig } from './buildConfig'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from './types'

describe('buildClankerDeploymentConfig', () => {
  test('includes opencode endpoint and model when provided', () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'docker',
      selectedAgent: 'opencode',
      form: {
        ...DEFAULT_CLANKER_CONFIG_FORM_STATE,
        provisioningMode: 'managed',
        opencodeEndpoint: ' https://openrouter.ai/api/v1 ',
        opencodeModel: ' openai/gpt-5 ',
      },
    })

    expect(result).toMatchObject({
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
    })
  })

  test('omits opencode endpoint and model when blank', () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'docker',
      selectedAgent: 'opencode',
      form: {
        ...DEFAULT_CLANKER_CONFIG_FORM_STATE,
        provisioningMode: 'managed',
        opencodeEndpoint: '  ',
        opencodeModel: '',
      },
    })

    expect(result).toMatchObject({
      version: 1,
      agent: {
        type: 'opencode',
      },
    })
    expect(result).not.toHaveProperty('agent.endpoint')
    expect(result).not.toHaveProperty('agent.model')
  })

  test('includes the antigravity model when provided', () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'docker',
      selectedAgent: 'antigravity',
      form: {
        ...DEFAULT_CLANKER_CONFIG_FORM_STATE,
        antigravityModel: ' gemini-3.1-pro-high ',
      },
    })

    expect(result).toMatchObject({
      agent: { type: 'antigravity', model: 'gemini-3.1-pro-high' },
    })
  })

  test('keeps pi as the agent rather than falling back to claude-code', () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'docker',
      selectedAgent: 'pi',
      form: DEFAULT_CLANKER_CONFIG_FORM_STATE,
    })

    expect(result).toMatchObject({ agent: { type: 'pi' } })
  })

  test('includes lambda memorySize and timeout in managed mode', () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'lambda',
      selectedAgent: 'claude-code',
      form: {
        ...DEFAULT_CLANKER_CONFIG_FORM_STATE,
        provisioningMode: 'managed',
        lambdaMemorySize: '2048',
        lambdaTimeout: '120',
      },
    })

    expect(result).toMatchObject({
      version: 1,
      strategy: {
        type: 'lambda',
        provisioningMode: 'managed',
        memorySize: 2048,
        timeout: 120,
      },
    })
  })

  test('omits lambda memorySize and timeout when blank', () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'lambda',
      selectedAgent: 'claude-code',
      form: {
        ...DEFAULT_CLANKER_CONFIG_FORM_STATE,
        provisioningMode: 'managed',
        lambdaMemorySize: '',
        lambdaTimeout: '',
      },
    })

    expect(result).toMatchObject({
      version: 1,
      strategy: {
        type: 'lambda',
        provisioningMode: 'managed',
      },
    })
    expect(result.strategy).not.toHaveProperty('memorySize')
    expect(result.strategy).not.toHaveProperty('timeout')
  })

  test('omits lambda memorySize and timeout in prebuilt mode', () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'lambda',
      selectedAgent: 'claude-code',
      form: {
        ...DEFAULT_CLANKER_CONFIG_FORM_STATE,
        provisioningMode: 'prebuilt',
        functionArn: 'arn:aws:lambda:us-east-1:123456789:function:my-function',
        lambdaMemorySize: '2048',
        lambdaTimeout: '120',
      },
    })

    expect(result).toMatchObject({
      version: 1,
      strategy: {
        type: 'lambda',
        provisioningMode: 'prebuilt',
        functionArn: 'arn:aws:lambda:us-east-1:123456789:function:my-function',
      },
    })
    expect(result.strategy).not.toHaveProperty('memorySize')
    expect(result.strategy).not.toHaveProperty('timeout')
  })

  describe('when editing', () => {
    const kimiConfig = {
      version: 1,
      strategy: { type: 'docker', provisioningMode: 'prebuilt' },
      agent: { type: 'kimi-code', endpoint: 'https://api.moonshot.ai/v1', model: 'kimi-k3', temperature: 0.2 },
      runtime: { settings: { runTests: true } },
    }

    test('keeps agent settings the form has no inputs for', () => {
      const result = buildClankerDeploymentConfig({
        strategyName: 'docker',
        selectedAgent: 'kimi-code',
        form: { ...DEFAULT_CLANKER_CONFIG_FORM_STATE, kimiEndpoint: 'https://api.moonshot.ai/v1', kimiModel: 'kimi-k3' },
        existing: kimiConfig,
      })

      expect(result.agent).toEqual({
        type: 'kimi-code',
        endpoint: 'https://api.moonshot.ai/v1',
        model: 'kimi-k3',
        temperature: 0.2,
      })
      expect(result.runtime).toEqual({ settings: { runTests: true } })
    })

    test('lets a blanked form field clear the stored value', () => {
      const result = buildClankerDeploymentConfig({
        strategyName: 'docker',
        selectedAgent: 'opencode',
        form: { ...DEFAULT_CLANKER_CONFIG_FORM_STATE, opencodeModel: '' },
        existing: { version: 1, strategy: { type: 'docker' }, agent: { type: 'opencode', model: 'opencode-go/kimi-k3' } },
      })

      expect(result.agent).toEqual({ type: 'opencode' })
    })

    test('drops the old agent settings when the agent changes', () => {
      const result = buildClankerDeploymentConfig({
        strategyName: 'docker',
        selectedAgent: 'claude-code',
        form: DEFAULT_CLANKER_CONFIG_FORM_STATE,
        existing: kimiConfig,
      })

      expect(result.agent).toEqual({ type: 'claude-code' })
    })
  })
})

test('builds a prebuilt Kubernetes worker with resource bounds', () => {
  expect(buildClankerDeploymentConfig({ strategyName: 'kubernetes', selectedAgent: 'opencode', form: { ...DEFAULT_CLANKER_CONFIG_FORM_STATE, containerImage: 'worker:1', kubernetesCpu: '250m', kubernetesMemory: '512Mi', kubernetesStorage: '2Gi', kubernetesDeadline: '120' } }).strategy).toEqual({ type: 'kubernetes', provisioningMode: 'prebuilt', containerImage: 'worker:1', cpu: '250m', memory: '512Mi', ephemeralStorage: '2Gi', activeDeadlineSeconds: 120 })
})
