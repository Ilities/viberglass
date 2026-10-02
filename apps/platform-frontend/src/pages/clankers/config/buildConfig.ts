import {
  isObjectRecord,
  type AgentType,
  type ClankerAgentConfig,
  type ClankerStrategyConfig,
} from '@viberglass/types'
import { DEFAULT_CODEX_AUTH_SECRET_NAME, type BuildConfigInput } from './types'
import { normalizeStrategyName } from './normalizers'

function buildStrategy(input: BuildConfigInput): ClankerStrategyConfig {
  const strategyName = normalizeStrategyName(input.strategyName)
  const form = input.form

  if (strategyName === 'kubernetes') {
    return {
      type: 'kubernetes', provisioningMode: 'prebuilt',
      containerImage: form.containerImage.trim() || undefined,
      cpu: form.kubernetesCpu.trim() || undefined,
      memory: form.kubernetesMemory.trim() || undefined,
      ephemeralStorage: form.kubernetesStorage.trim() || undefined,
      activeDeadlineSeconds: form.kubernetesDeadline.trim() ? Number(form.kubernetesDeadline) : undefined,
    }
  }

  if (strategyName === 'ecs') {
    return {
      type: 'ecs',
      provisioningMode: form.provisioningMode,
      clusterArn: form.provisioningMode === 'prebuilt' ? form.clusterArn : undefined,
      taskDefinitionArn: form.provisioningMode === 'prebuilt' ? form.taskDefinitionArn : undefined,
    }
  }

  if (strategyName === 'aws-lambda-container' || strategyName === 'lambda') {
    const memorySize = form.lambdaMemorySize.trim()
    const timeout = form.lambdaTimeout.trim()
    const ephemeralStorage = form.lambdaEphemeralStorage.trim()
    return {
      type: 'lambda',
      provisioningMode: form.provisioningMode,
      functionArn: form.provisioningMode === 'prebuilt' ? form.functionArn : undefined,
      ...(form.provisioningMode === 'managed' && memorySize ? { memorySize: parseInt(memorySize, 10) } : {}),
      ...(form.provisioningMode === 'managed' && timeout ? { timeout: parseInt(timeout, 10) } : {}),
      ...(form.provisioningMode === 'managed' && ephemeralStorage ? { ephemeralStorage: parseInt(ephemeralStorage, 10) } : {}),
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
        ...(input.form.codexLoginSecretId ? { loginSecretId: input.form.codexLoginSecretId } : {}),
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

  if (selectedAgent === 'opencode') {
    const endpoint = input.form.opencodeEndpoint.trim()
    const model = input.form.opencodeModel.trim()
    return {
      type: 'opencode',
      ...(endpoint ? { endpoint } : {}),
      ...(model ? { model } : {}),
    }
  }

  if (selectedAgent === 'antigravity') {
    const model = input.form.antigravityModel.trim()
    return {
      type: 'antigravity',
      ...(model ? { model } : {}),
    }
  }

  if (selectedAgent === 'kimi-code') {
    const endpoint = input.form.kimiEndpoint.trim()
    const model = input.form.kimiModel.trim()
    return {
      type: 'kimi-code',
      ...(endpoint ? { endpoint } : {}),
      ...(model ? { model } : {}),
    }
  }

  const fallback =
    selectedAgent === 'claude-code' ||
    selectedAgent === 'mistral-vibe' ||
    selectedAgent === 'pi'
      ? selectedAgent
      : 'claude-code'
  return {
    type: fallback,
  }
}

/** Agent settings this form has inputs for; blanking one of these clears it. */
const FORM_AGENT_FIELDS: Partial<Record<AgentType, string[]>> = {
  codex: ['codexAuth'],
  'qwen-cli': ['endpoint'],
  opencode: ['endpoint', 'model'],
  antigravity: ['model'],
  'kimi-code': ['endpoint', 'model'],
}

/** Keeps the stored agent's settings the form doesn't show, such as a Kimi endpoint and model set by setup. */
function keepUnshownAgentSettings(built: ClankerAgentConfig, existing: unknown): Record<string, unknown> {
  if (!isObjectRecord(existing) || existing.type !== built.type) {
    return { ...built }
  }
  const shown = new Set(FORM_AGENT_FIELDS[built.type] ?? [])
  const unshown = Object.fromEntries(Object.entries(existing).filter(([key]) => !shown.has(key)))
  return { ...unshown, ...built }
}

export function buildClankerDeploymentConfig(input: BuildConfigInput): Record<string, unknown> {
  const existing = isObjectRecord(input.existing) && input.existing.version === 1 ? input.existing : null
  return {
    version: 1,
    strategy: buildStrategy(input),
    agent: keepUnshownAgentSettings(buildAgent(input.selectedAgent, input), existing?.agent),
    ...(existing && isObjectRecord(existing.runtime) ? { runtime: existing.runtime } : {}),
  }
}
