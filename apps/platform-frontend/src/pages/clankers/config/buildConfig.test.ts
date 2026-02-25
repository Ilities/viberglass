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
})
