import { getAgentSettingFields, isClankerConfigV1, pickSettingValues, type ClankerConfigV1 } from '@viberglass/types'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE, type ClankerConfigReadable, type ReadConfigOutput } from './types'

function timeLimitMinutesOf(seconds: number | undefined): string {
  return seconds ? String(Math.round(seconds / 60)) : ''
}

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
      ecsCpu: strategy.type === 'ecs' ? strategy.cpu || '' : '',
      ecsMemory: strategy.type === 'ecs' ? strategy.memory || '' : '',
      functionArn: strategy.type === 'lambda' ? strategy.functionArn || '' : '',
      lambdaMemorySize: strategy.type === 'lambda' ? String(strategy.memorySize || '') : '',
      lambdaTimeout: strategy.type === 'lambda' ? String(strategy.timeout || '') : '',
      lambdaEphemeralStorage: strategy.type === 'lambda' ? String(strategy.ephemeralStorage || '') : '',
      timeLimitMinutes: timeLimitMinutesOf(config.runtime?.settings?.maxExecutionTime),
      values: { [agent.type]: pickSettingValues(getAgentSettingFields(agent.type), agent) },
      signInMethod: agent.signIn?.method ?? '',
      loginSecretId: agent.signIn?.loginSecretId ?? '',
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
