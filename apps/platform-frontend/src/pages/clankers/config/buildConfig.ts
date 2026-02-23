import type {
  AgentType,
  ClankerAgentConfig,
  ClankerStrategyConfig,
} from '@viberglass/types'
import { DEFAULT_CODEX_AUTH_SECRET_NAME, type BuildConfigInput } from './types'
import { normalizeStrategyName } from './normalizers'

function buildStrategy(input: BuildConfigInput): ClankerStrategyConfig {
  const strategyName = normalizeStrategyName(input.strategyName)
  const form = input.form

  if (strategyName === 'ecs') {
    return {
      type: 'ecs',
      provisioningMode: form.provisioningMode,
      clusterArn: form.provisioningMode === 'prebuilt' ? form.clusterArn : undefined,
      taskDefinitionArn: form.provisioningMode === 'prebuilt' ? form.taskDefinitionArn : undefined,
    }
  }

  if (strategyName === 'aws-lambda-container' || strategyName === 'lambda') {
    return {
      type: 'lambda',
      provisioningMode: form.provisioningMode,
      functionArn: form.provisioningMode === 'prebuilt' ? form.functionArn : undefined,
    }
  }

  return {
    type: 'docker',
    provisioningMode: form.provisioningMode,
    containerImage: form.provisioningMode === 'prebuilt' ? form.containerImage : undefined,
  }
}

function buildAgent(selectedAgent: AgentType | '' | null | undefined, input: BuildConfigInput): ClankerAgentConfig {
  if (selectedAgent === 'codex') {
    return {
      type: 'codex',
      codexAuth: {
        mode: input.form.codexAuthMode,
        secretName: DEFAULT_CODEX_AUTH_SECRET_NAME,
      },
    }
  }

  if (selectedAgent === 'qwen-cli') {
    const endpoint = input.form.qwenEndpoint.trim()
    return {
      type: 'qwen-cli',
      ...(endpoint ? { endpoint } : {}),
    }
  }

  const fallback =
    selectedAgent === 'claude-code' ||
    selectedAgent === 'opencode' ||
    selectedAgent === 'kimi-code' ||
    selectedAgent === 'gemini-cli' ||
    selectedAgent === 'mistral-vibe'
      ? selectedAgent
      : 'claude-code'
  return {
    type: fallback,
  }
}

export function buildClankerDeploymentConfig(input: BuildConfigInput): Record<string, unknown> {
  return {
    version: 1,
    strategy: buildStrategy(input),
    agent: buildAgent(input.selectedAgent, input),
  }
}
