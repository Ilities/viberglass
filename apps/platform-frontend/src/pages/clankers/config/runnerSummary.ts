import type { Secret } from '@/service/api/secret-api'
import {
  getAgentEnvVarNames,
  getAgentSettingFields,
  getModelProvider,
  getRunnerSignIn,
  isClankerConfigV1,
  pickSettingValues,
  runnerCredentialProblem,
  type Clanker,
  type ModelEndpoint,
  type SecretBinding,
} from '@viberglass/types'
import { providerOptionsForAgent, splitRunnerBindings } from './modelKey'

/** The runner's value for the setting that takes a provider's default model or endpoint. */
function providerDefaultSetting(agent: string, agentConfig: unknown, kind: 'model' | 'endpoint'): string | null {
  const fields = getAgentSettingFields(agent)
  const field = fields.find((candidate) => candidate.providerDefault === kind)
  return field ? (pickSettingValues(fields, agentConfig)[field.key] ?? null) : null
}

export interface RunnerSummary {
  providerLabel: string | null
  /** The workspace model endpoint the runner uses, when it uses one. */
  endpoint: { name: string; host: string; keyLabel: string | null } | null
  model: string | null
  /** The key the agent uses, or null when it has none. */
  key: { label: string; envVar: string } | null
  /** The account the agent signs in with instead of a key, and its stored login once connected. */
  signIn: { label: string; loginSecretId: string | null } | null
  /**
   * Where the agent sends requests when it isn't the provider's own address:
   * a URL set on the runner, or a variable that sets one. Then the provider is
   * only who issued the key, and the endpoint decides which model runs.
   */
  customEndpoint: { url: string | null; envVar: string | null } | null
  /** Why the runner can't run tasks as configured, or null. */
  problem: string | null
  extras: SecretBinding[]
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** What a runner runs on, in the terms the runner form uses, plus anything that stops it working. */
export function summarizeRunner(
  clanker: Pick<Clanker, 'agent' | 'deploymentConfig' | 'secretBindings' | 'modelEndpoint'>,
  secrets: Secret[],
  endpoints: Array<Pick<ModelEndpoint, 'id' | 'name' | 'baseUrl' | 'auth' | 'secretId'>> = [],
): RunnerSummary {
  const agent = clanker.agent ?? ''
  const config = isClankerConfigV1(clanker.deploymentConfig) ? clanker.deploymentConfig : null
  const agentConfig = config?.agent
  const model = clanker.modelEndpoint?.model ?? providerDefaultSetting(agent, agentConfig, 'model')
  const runnerSignIn = getRunnerSignIn(clanker.deploymentConfig)
  const signIn = runnerSignIn ? { label: runnerSignIn.method.label, loginSecretId: runnerSignIn.signIn.loginSecretId ?? null } : null

  const { provider, modelKey, extras } = splitRunnerBindings(clanker.secretBindings, secrets, agent)
  const keySecret = modelKey ? secrets.find((secret) => secret.id === modelKey.secretId) : undefined
  const key = !clanker.modelEndpoint && modelKey ? { label: keySecret?.name ?? 'Deleted secret', envVar: modelKey.envVar } : null

  const providerEndpoint = providerOptionsForAgent(agent).find((option) => option.provider === provider)?.endpoint ?? null
  const configuredUrl = providerDefaultSetting(agent, agentConfig, 'endpoint')
  const endpointVars = new Set(agent ? getAgentEnvVarNames(agent).endpoint : [])
  const endpointVar = extras.find((binding) => endpointVars.has(binding.envVar))?.envVar ?? null
  const customUrl = configuredUrl && configuredUrl !== providerEndpoint ? configuredUrl : null
  const customEndpoint = !clanker.modelEndpoint && (customUrl || endpointVar) ? { url: customUrl, envVar: endpointVar } : null

  const usedEndpoint = clanker.modelEndpoint
    ? endpoints.find((candidate) => candidate.id === clanker.modelEndpoint?.endpointId)
    : undefined
  const endpoint = usedEndpoint
    ? {
        name: usedEndpoint.name,
        host: hostOf(usedEndpoint.baseUrl),
        keyLabel:
          usedEndpoint.auth.scheme === 'none'
            ? null
            : (secrets.find((secret) => secret.id === usedEndpoint.secretId)?.name ?? 'Deleted secret'),
      }
    : null

  const problem = runnerCredentialProblem(clanker, new Set(secrets.map((secret) => secret.id)))?.problem ?? null

  return {
    providerLabel: clanker.modelEndpoint
      ? (endpoint?.name ?? 'Workspace model')
      : provider
        ? getModelProvider(provider).displayName
        : null,
    endpoint,
    model,
    key,
    signIn,
    customEndpoint,
    problem,
    extras,
  }
}
