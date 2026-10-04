import type { Secret } from '@/service/api/secret-api'
import { getModelProvider, isClankerConfigV1, type Clanker, type SecretBinding } from '@viberglass/types'
import { providerOptionsForAgent, splitRunnerBindings } from './modelKey'

export interface RunnerSummary {
  providerLabel: string | null
  model: string | null
  /** The key the agent uses, or null when it has none. */
  key: { label: string; envVar: string } | null
  usesChatGptLogin: boolean
  /** For a ChatGPT login: the stored login's secret, once the runner is connected. */
  loginSecretId: string | null
  /** Why the runner can't run tasks as configured, or null. */
  problem: string | null
  extras: SecretBinding[]
}

/** What a runner runs on, in the terms the runner form uses, plus anything that stops it working. */
export function summarizeRunner(clanker: Pick<Clanker, 'agent' | 'deploymentConfig' | 'secretBindings' | 'modelEndpoint'>, secrets: Secret[]): RunnerSummary {
  const agent = clanker.agent ?? ''
  const config = isClankerConfigV1(clanker.deploymentConfig) ? clanker.deploymentConfig : null
  const agentConfig = config?.agent
  const model = clanker.modelEndpoint?.model ?? (agentConfig && 'model' in agentConfig && typeof agentConfig.model === 'string' ? agentConfig.model : null)
  const usesChatGptLogin = agentConfig?.type === 'codex' && agentConfig.codexAuth.mode !== 'api_key'
  const loginSecretId = (agentConfig?.type === 'codex' && agentConfig.codexAuth.loginSecretId) || null

  const { provider, modelKey, extras } = splitRunnerBindings(clanker.secretBindings, secrets, agent)
  const keySecret = modelKey ? secrets.find((secret) => secret.id === modelKey.secretId) : undefined
  const key = !clanker.modelEndpoint && modelKey ? { label: keySecret?.name ?? 'Deleted secret', envVar: modelKey.envVar } : null

  // An agent with no provider to pick, like the test agent, needs no key.
  const needsKey = !clanker.modelEndpoint && !usesChatGptLogin && providerOptionsForAgent(agent).length > 0
  const problem = usesChatGptLogin
    ? loginSecretId
      ? null
      : 'Not connected to ChatGPT yet. Start the runner, then connect your ChatGPT account below.'
    : !needsKey
    ? null
    : !modelKey
      ? 'No model key: the agent has no key it reads, so tasks will fail. Edit the runner to choose one.'
      : !keySecret
        ? 'Its model key was deleted. Edit the runner to choose another.'
        : null

  return {
    providerLabel: clanker.modelEndpoint ? 'Custom endpoint' : provider ? getModelProvider(provider).displayName : null,
    model,
    key,
    usesChatGptLogin,
    loginSecretId,
    problem,
    extras,
  }
}
