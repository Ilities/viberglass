import type { Secret } from '@/service/api/secret-api'
import {
  getAgentEnvVarNames,
  getModelProvider,
  isClankerConfigV1,
  runnerCredentialProblem,
  type Clanker,
  type ModelEndpoint,
  type SecretBinding,
} from '@viberglass/types'
import { providerOptionsForAgent, splitRunnerBindings } from './modelKey'

export interface RunnerSummary {
  providerLabel: string | null
  /** The workspace model endpoint the runner uses, when it uses one. */
  endpoint: { name: string; host: string; keyLabel: string | null } | null
  model: string | null
  /** The key the agent uses, or null when it has none. */
  key: { label: string; envVar: string } | null
  usesChatGptLogin: boolean
  /** For a ChatGPT login: the stored login's secret, once the runner is connected. */
  loginSecretId: string | null
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
  const model = clanker.modelEndpoint?.model ?? (agentConfig && 'model' in agentConfig && typeof agentConfig.model === 'string' ? agentConfig.model : null)
  const usesChatGptLogin = agentConfig?.type === 'codex' && agentConfig.codexAuth.mode !== 'api_key'
  const loginSecretId = (agentConfig?.type === 'codex' && agentConfig.codexAuth.loginSecretId) || null

  const { provider, modelKey, extras } = splitRunnerBindings(clanker.secretBindings, secrets, agent)
  const keySecret = modelKey ? secrets.find((secret) => secret.id === modelKey.secretId) : undefined
  const key = !clanker.modelEndpoint && modelKey ? { label: keySecret?.name ?? 'Deleted secret', envVar: modelKey.envVar } : null

  const providerEndpoint = providerOptionsForAgent(agent).find((option) => option.provider === provider)?.endpoint ?? null
  const configuredUrl =
    agentConfig && 'endpoint' in agentConfig && typeof agentConfig.endpoint === 'string' && agentConfig.endpoint
      ? agentConfig.endpoint
      : agentConfig?.type === 'codex'
        ? (agentConfig.cli?.baseUrl ?? null)
        : null
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
    usesChatGptLogin,
    loginSecretId,
    customEndpoint,
    problem,
    extras,
  }
}
