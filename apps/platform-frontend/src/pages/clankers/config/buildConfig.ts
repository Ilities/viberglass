import {
  DEFAULT_AGENT_TYPE,
  getAgentSettingFields,
  getAgentSignInMethods,
  isObjectRecord,
  pickSettingValues,
  type AgentType,
  type ClankerAgentConfig,
  type ClankerStrategyConfig,
} from '@viberglass/types'
import type { BuildConfigInput } from './types'
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
    containerImage: form.provisioningMode === 'prebuilt' ? form.containerImage.trim() || undefined : undefined,
  }
}

function buildAgent(selectedAgent: AgentType, input: BuildConfigInput): ClankerAgentConfig {
  return {
    type: selectedAgent,
    ...pickSettingValues(getAgentSettingFields(selectedAgent), input.form.values[selectedAgent]),
    ...signInOf(selectedAgent, input),
  }
}

/** The sign-in the runner chose, when its harness declares it; without one the runner uses an API key. */
function signInOf(agent: AgentType, input: BuildConfigInput): Pick<ClankerAgentConfig, 'signIn'> {
  const { signInMethod, loginSecretId } = input.form
  if (!getAgentSignInMethods(agent).some((method) => method.id === signInMethod)) return {}
  return { signIn: { method: signInMethod, ...(loginSecretId ? { loginSecretId } : {}) } }
}

/** Agent settings this form has inputs for; blanking one of these clears it. */
function shownAgentSettings(agent: AgentType): Set<string> {
  const keys = getAgentSettingFields(agent).map((field) => field.key)
  return new Set(getAgentSignInMethods(agent).length > 0 ? [...keys, 'signIn'] : keys)
}

/** Keeps the stored agent's settings the form doesn't show. */
function keepUnshownAgentSettings(built: ClankerAgentConfig, existing: unknown): Record<string, unknown> {
  if (!isObjectRecord(existing) || existing.type !== built.type) {
    return { ...built }
  }
  const shown = shownAgentSettings(built.type)
  const unshown = Object.fromEntries(Object.entries(existing).filter(([key]) => !shown.has(key)))
  return { ...unshown, ...built }
}

export function buildClankerDeploymentConfig(input: BuildConfigInput): Record<string, unknown> {
  const existing = isObjectRecord(input.existing) && input.existing.version === 1 ? input.existing : null
  return {
    version: 1,
    strategy: buildStrategy(input),
    agent: keepUnshownAgentSettings(buildAgent(input.selectedAgent || DEFAULT_AGENT_TYPE, input), existing?.agent),
    ...(existing && isObjectRecord(existing.runtime) ? { runtime: existing.runtime } : {}),
  }
}
