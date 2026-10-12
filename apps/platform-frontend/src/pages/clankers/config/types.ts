import type { AgentType, Clanker, ClankerConfigV1 } from "@viberglass/types"

export type ProvisioningMode = 'managed' | 'prebuilt'

/** The harness settings the runner form edits. */
export interface AgentSettings {
  /** Setting values by harness, then by key, so switching harness and back keeps them. */
  values: Record<AgentType, Record<string, string>>
  /** The interactive sign-in the harness declares that the runner uses; empty for an API key. */
  signInMethod: string
  /** The runner's stored login; set by connecting, kept through edits. */
  loginSecretId: string
}

export interface ClankerConfigFormState extends AgentSettings {
  provisioningMode: ProvisioningMode
  containerImage: string
  kubernetesCpu: string
  kubernetesMemory: string
  kubernetesStorage: string
  kubernetesDeadline: string
  clusterArn: string
  taskDefinitionArn: string
  functionArn: string
  lambdaMemorySize: string
  lambdaTimeout: string
  lambdaEphemeralStorage: string
}

export const DEFAULT_CLANKER_CONFIG_FORM_STATE: ClankerConfigFormState = {
  provisioningMode: 'managed',
  containerImage: '',
  kubernetesCpu: '',
  kubernetesMemory: '',
  kubernetesStorage: '',
  kubernetesDeadline: '',
  clusterArn: '',
  taskDefinitionArn: '',
  functionArn: '',
  lambdaMemorySize: '',
  lambdaTimeout: '',
  lambdaEphemeralStorage: '',
  values: {},
  signInMethod: '',
  loginSecretId: '',
}

export type StrategyName = 'docker' | 'ecs' | 'aws-lambda-container' | 'lambda' | 'kubernetes'

export interface BuildConfigInput {
  strategyName?: string
  selectedAgent?: AgentType | '' | null
  form: ClankerConfigFormState
  /** The runner's stored deployment config, when editing. */
  existing?: DeploymentConfig
}

export interface ReadConfigOutput {
  form: ClankerConfigFormState
}

export type DeploymentConfig = ClankerConfigV1 | Record<string, unknown> | null

export interface ClankerConfigReadable {
  deploymentConfig?: Clanker['deploymentConfig']
}
