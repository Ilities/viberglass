import { getAgentSettingFields, isClankerConfigV1, pickSettingValues, type ClankerConfigV1 } from '@viberglass/types'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE, type ClankerConfigReadable, type ReadConfigOutput } from './types'

function readV1Config(config: ClankerConfigV1): ReadConfigOutput {
  const strategy = config.strategy
  const agent = config.agent
  const provisioningMode: 'managed' | 'prebuilt' = strategy.provisioningMode === 'prebuilt' ? 'prebuilt' : 'managed'

  return {
    form: {
      ...DEFAULT_CLANKER_CONFIG_FORM_STATE,
      kubernetesCpu: strategy.type === 'kubernetes' ? strategy.cpu || '' : '',
      kubernetesMemory: strategy.type === 'kubernetes' ? strategy.memory || '' : '',
      kubernetesStorage: strategy.type === 'kubernetes' ? strategy.ephemeralStorage || '' : '',
      kubernetesDeadline: strategy.type === 'kubernetes' ? String(strategy.activeDeadlineSeconds || '') : '',
      provisioningMode,
      containerImage: (strategy.type === 'docker' || strategy.type === 'kubernetes') ? strategy.containerImage || '' : '',
      clusterArn: strategy.type === 'ecs' ? strategy.clusterArn || '' : '',
      taskDefinitionArn: strategy.type === 'ecs' ? strategy.taskDefinitionArn || '' : '',
      functionArn: strategy.type === 'lambda' ? strategy.functionArn || '' : '',
      lambdaMemorySize: strategy.type === 'lambda' ? String(strategy.memorySize || '') : '',
      lambdaTimeout: strategy.type === 'lambda' ? String(strategy.timeout || '') : '',
      lambdaEphemeralStorage: strategy.type === 'lambda' ? String(strategy.ephemeralStorage || '') : '',
      values: { [agent.type]: pickSettingValues(getAgentSettingFields(agent.type), agent) },
      codexAuthMode: agent.codexAuth?.mode ?? DEFAULT_CLANKER_CONFIG_FORM_STATE.codexAuthMode,
      codexLoginSecretId: agent.codexAuth?.loginSecretId ?? '',
    },
  }
}

/** The form for a runner's stored config; one saved without a config gets the defaults. */
export function readClankerDeploymentConfig(input: ClankerConfigReadable): ReadConfigOutput {
  if (isClankerConfigV1(input.deploymentConfig)) {
    return readV1Config(input.deploymentConfig)
  }

  return { form: DEFAULT_CLANKER_CONFIG_FORM_STATE }
}
