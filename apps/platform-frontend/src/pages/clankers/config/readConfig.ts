import { isClankerConfigV1, isObjectRecord, type ClankerConfigV1 } from '@viberglass/types'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE, type ClankerConfigReadable, type ReadConfigOutput } from './types'

function readLegacyConfig(input: ClankerConfigReadable): ReadConfigOutput {
  const config = isObjectRecord(input.deploymentConfig) ? input.deploymentConfig : {}

  const hasResources =
    typeof config.containerImage === 'string' ||
    typeof config.clusterArn === 'string' ||
    typeof config.taskDefinitionArn === 'string' ||
    typeof config.functionArn === 'string'

  const provisioningMode =
    config.provisioningMode === 'prebuilt' || config.provisioningMode === 'managed'
      ? config.provisioningMode
      : hasResources
        ? 'prebuilt'
        : 'managed'

  const codexAuth = isObjectRecord(config.codexAuth) ? config.codexAuth : null
  const codexAuthMode = codexAuth?.mode === 'chatgpt_device' ? 'chatgpt_device' : 'api_key'

  return {
    form: {
      provisioningMode,
      containerImage: typeof config.containerImage === 'string' ? config.containerImage : '',
      clusterArn: typeof config.clusterArn === 'string' ? config.clusterArn : '',
      taskDefinitionArn: typeof config.taskDefinitionArn === 'string' ? config.taskDefinitionArn : '',
      functionArn: typeof config.functionArn === 'string' ? config.functionArn : '',
      codexAuthMode,
    },
  }
}

function readV1Config(config: ClankerConfigV1): ReadConfigOutput {
  const strategy = config.strategy
  const agent = config.agent
  const provisioningMode: 'managed' | 'prebuilt' = strategy.provisioningMode === 'prebuilt' ? 'prebuilt' : 'managed'

  const strategyForm = {
    provisioningMode,
    containerImage: strategy.type === 'docker' ? strategy.containerImage || '' : '',
    clusterArn: strategy.type === 'ecs' ? strategy.clusterArn || '' : '',
    taskDefinitionArn: strategy.type === 'ecs' ? strategy.taskDefinitionArn || '' : '',
    functionArn: strategy.type === 'lambda' ? strategy.functionArn || '' : '',
  }

  const codexForm =
    agent.type === 'codex'
      ? {
          codexAuthMode: agent.codexAuth.mode,
        }
      : {
          codexAuthMode: DEFAULT_CLANKER_CONFIG_FORM_STATE.codexAuthMode,
        }

  return {
    form: {
      ...strategyForm,
      ...codexForm,
    },
  }
}

export function readClankerDeploymentConfig(input: ClankerConfigReadable): ReadConfigOutput {
  if (isClankerConfigV1(input.deploymentConfig)) {
    return readV1Config(input.deploymentConfig)
  }

  return readLegacyConfig(input)
}
