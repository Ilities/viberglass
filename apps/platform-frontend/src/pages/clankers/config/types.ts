import type { AgentType, Clanker, ClankerConfigV1, CodexAuthMode } from "@viberglass/types"

export type ProvisioningMode = 'managed' | 'prebuilt'

export interface ClankerConfigFormState {
  provisioningMode: ProvisioningMode
  containerImage: string
  clusterArn: string
  taskDefinitionArn: string
  functionArn: string
  lambdaMemorySize: string
  lambdaTimeout: string
  codexAuthMode: CodexAuthMode
  qwenEndpoint: string
  opencodeEndpoint: string
  opencodeModel: string
  geminiModel: string
}

export const DEFAULT_CODEX_AUTH_SECRET_NAME = 'CODEX_AUTH_JSON'

export const DEFAULT_CLANKER_CONFIG_FORM_STATE: ClankerConfigFormState = {
  provisioningMode: 'managed',
  containerImage: '',
  clusterArn: '',
  taskDefinitionArn: '',
  functionArn: '',
  lambdaMemorySize: '',
  lambdaTimeout: '',
  codexAuthMode: 'api_key',
  qwenEndpoint: '',
  opencodeEndpoint: '',
  opencodeModel: '',
  geminiModel: '',
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
