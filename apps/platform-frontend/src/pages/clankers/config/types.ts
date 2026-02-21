import type { AgentType, Clanker, ClankerConfigV1, CodexAuthMode } from "@viberglass/types"

export type ProvisioningMode = 'managed' | 'prebuilt'

export interface ClankerConfigFormState {
  provisioningMode: ProvisioningMode
  containerImage: string
  clusterArn: string
  taskDefinitionArn: string
  functionArn: string
  codexAuthMode: CodexAuthMode
  codexAuthSecretName: string
}

export const DEFAULT_CLANKER_CONFIG_FORM_STATE: ClankerConfigFormState = {
  provisioningMode: 'managed',
  containerImage: '',
  clusterArn: '',
  taskDefinitionArn: '',
  functionArn: '',
  codexAuthMode: 'api_key',
  codexAuthSecretName: 'CODEX_AUTH_JSON',
}

export type StrategyName = 'docker' | 'ecs' | 'aws-lambda-container' | 'lambda'

export interface BuildConfigInput {
  strategyName?: string
  selectedAgent?: AgentType | '' | null
  form: ClankerConfigFormState
}

export interface ReadConfigOutput {
  form: ClankerConfigFormState
}

export type DeploymentConfig = ClankerConfigV1 | Record<string, unknown> | null

export interface ClankerConfigReadable {
  deploymentConfig?: Clanker['deploymentConfig']
  agent?: Clanker['agent']
}
