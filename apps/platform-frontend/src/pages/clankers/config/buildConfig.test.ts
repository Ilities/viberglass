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
})
