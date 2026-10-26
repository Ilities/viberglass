import { buildClankerDeploymentConfig } from './buildConfig'
import { defaultProvisioningMode } from './normalizers'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from './types'

describe('buildClankerDeploymentConfig', () => {
  test('a Docker runner uses the published image unless it names one', () => {
    expect(defaultProvisioningMode('docker')).toBe('prebuilt')
    expect(defaultProvisioningMode('ecs')).toBe('managed')
    const result = buildClankerDeploymentConfig({
      strategyName: 'docker',
      selectedAgent: 'claude-code',
      form: { ...DEFAULT_CLANKER_CONFIG_FORM_STATE, provisioningMode: 'prebuilt', containerImage: '  ' },
    })
    expect(result.strategy).toEqual({ type: 'docker', provisioningMode: 'prebuilt', containerImage: undefined })
  })

  test('includes opencode endpoint and model when provided', () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'docker',
      selectedAgent: 'opencode',
      form: {
        ...DEFAULT_CLANKER_CONFIG_FORM_STATE,
        provisioningMode: 'managed',
        values: { opencode: { endpoint: ' https://openrouter.ai/api/v1 ', model: ' openai/gpt-5 ' } },
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
        values: { opencode: { endpoint: '  ', model: '' } },
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
        values: { antigravity: { model: ' gemini-3.1-pro-high ' } },
      },
    })

    expect(result).toMatchObject({
      agent: { type: 'antigravity', model: 'gemini-3.1-pro-high' },
    })
  })

  test('stores the chosen harness rather than falling back to claude-code', () => {
    for (const agent of ['pi', 'fake']) {
      const result = buildClankerDeploymentConfig({ strategyName: 'docker', selectedAgent: agent, form: DEFAULT_CLANKER_CONFIG_FORM_STATE })
      expect(result.agent).toEqual({ type: agent })
    }
  })

  test("leaves out another harness's settings and keys this one doesn't declare", () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'docker',
      selectedAgent: 'antigravity',
      form: {
        ...DEFAULT_CLANKER_CONFIG_FORM_STATE,
        values: { antigravity: { model: 'gemini-3.1-pro-high', endpoint: 'https://x.example.com' }, opencode: { model: 'm' } },
      },
    })

    expect(result.agent).toEqual({ type: 'antigravity', model: 'gemini-3.1-pro-high' })
  })

  test('keeps a sign-in the harness declares, with its login', () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'docker',
      selectedAgent: 'codex',
      form: { ...DEFAULT_CLANKER_CONFIG_FORM_STATE, signInMethod: 'chatgpt', loginSecretId: 'login-1' },
    })

    expect(result.agent).toEqual({ type: 'codex', signIn: { method: 'chatgpt', loginSecretId: 'login-1' } })
  })

  test("signs in with an API key on a harness that doesn't declare the chosen sign-in", () => {
    const result = buildClankerDeploymentConfig({
      strategyName: 'docker',
      selectedAgent: 'opencode',
      form: { ...DEFAULT_CLANKER_CONFIG_FORM_STATE, signInMethod: 'chatgpt' },
    })

    expect(result.agent).toEqual({ type: 'opencode' })
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
        form: { ...DEFAULT_CLANKER_CONFIG_FORM_STATE, values: { 'kimi-code': { endpoint: 'https://api.moonshot.ai/v1', model: 'kimi-k3' } } },
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
        form: { ...DEFAULT_CLANKER_CONFIG_FORM_STATE, values: { opencode: { model: '' } } },
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

describe('ECS size and time limit', () => {
  const ecsForm = { ...DEFAULT_CLANKER_CONFIG_FORM_STATE, provisioningMode: 'managed' as const, ecsCpu: '2048', ecsMemory: '8192', timeLimitMinutes: '90' }

  test('a managed ECS runner keeps its size, and every runner its time limit in seconds', () => {
    const result = buildClankerDeploymentConfig({ strategyName: 'ecs', selectedAgent: 'opencode', form: ecsForm })
    expect(result.strategy).toEqual({ type: 'ecs', provisioningMode: 'managed', clusterArn: undefined, taskDefinitionArn: undefined, cpu: '2048', memory: '8192' })
    expect(result.runtime).toEqual({ settings: { maxExecutionTime: 5400 } })
  })

  test('a pre-built ECS runner uses its own task definition size', () => {
    const result = buildClankerDeploymentConfig({ strategyName: 'ecs', selectedAgent: 'opencode', form: { ...ecsForm, provisioningMode: 'prebuilt' } })
    expect(result.strategy).not.toHaveProperty('cpu')
    expect(result.strategy).not.toHaveProperty('memory')
  })

  test('blanking the time limit clears it and keeps the runtime settings the form does not show', () => {
    const existing = { version: 1, strategy: { type: 'ecs' }, agent: { type: 'opencode' }, runtime: { settings: { maxExecutionTime: 5400, maxChanges: 3 } } }
    const result = buildClankerDeploymentConfig({ strategyName: 'ecs', selectedAgent: 'opencode', existing, form: { ...ecsForm, timeLimitMinutes: '' } })
    expect(result.runtime).toEqual({ settings: { maxChanges: 3 } })
    const cleared = buildClankerDeploymentConfig({ strategyName: 'ecs', selectedAgent: 'opencode', form: { ...ecsForm, timeLimitMinutes: '' } })
    expect(cleared).not.toHaveProperty('runtime')
  })
})
