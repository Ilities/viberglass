import { isTestOnlyAgent } from './agentCatalog'
import { AGENT_PROVIDER_BINDINGS, getAgentEnvVarNames } from './agentProviders'
import type { Clanker } from './clanker'
import { isClankerConfigV1 } from './clankerConfig'
import { JOB_FAILURE_CODE } from './job'

/**
 * Whether a runner can take a task. Its compute being up (`status: active`)
 * is only one part: it also needs a model key or login, and the provider must
 * not have rejected that credential on its latest run.
 */
export type RunnerReadinessState = 'ready' | 'needs_key' | 'needs_login' | 'not_running' | 'credential_rejected'

/** The runner's latest finished run, the evidence that its credential works. */
export interface RunnerLastRun {
  status: 'completed' | 'failed'
  failureCode: string | null
  /** The failure in a few words, as the run recorded it. */
  failureTitle: string | null
  at: string
}

export interface RunnerReadiness {
  state: RunnerReadinessState
  /** One sentence on what stops it and who can fix it; null when ready. */
  problem: string | null
  lastRun: RunnerLastRun | null
}

type RunnerShape = Pick<Clanker, 'agent' | 'deploymentConfig' | 'secretBindings' | 'status' | 'deploymentStrategyId' | 'modelEndpoint'>

/** Whether the runner's Codex signs in with a ChatGPT login rather than an API key. */
export function runnerUsesChatGptLogin(clanker: Pick<Clanker, 'deploymentConfig'>): boolean {
  const agent = isClankerConfigV1(clanker.deploymentConfig) ? clanker.deploymentConfig.agent : null
  return agent?.type === 'codex' && agent.codexAuth.mode !== 'api_key'
}

function chatGptLoginSecretId(clanker: Pick<Clanker, 'deploymentConfig'>): string | null {
  const agent = isClankerConfigV1(clanker.deploymentConfig) ? clanker.deploymentConfig.agent : null
  return (agent?.type === 'codex' && agent.codexAuth.loginSecretId) || null
}

/** What stops the runner's agent from authenticating as configured, or null. */
export function runnerCredentialProblem(
  clanker: Pick<Clanker, 'agent' | 'deploymentConfig' | 'secretBindings' | 'modelEndpoint'>,
  existingSecretIds: ReadonlySet<string>,
): { state: 'needs_key' | 'needs_login'; problem: string } | null {
  const agent = clanker.agent
  if (!agent) return { state: 'needs_key', problem: 'No agent is chosen. An admin can edit the agent to pick one.' }
  // Endpoint credentials belong to the shared endpoint, whose references are validated on save.
  if (clanker.modelEndpoint) return null
  if (runnerUsesChatGptLogin(clanker)) {
    return chatGptLoginSecretId(clanker)
      ? null
      : { state: 'needs_login', problem: 'Not connected to ChatGPT yet. An admin can connect it from the agent.' }
  }
  // An agent with no provider to pick, like the test agent, needs no key.
  if (isTestOnlyAgent(agent) || !AGENT_PROVIDER_BINDINGS.some((binding) => binding.agent === agent)) return null
  const keyVars = new Set(getAgentEnvVarNames(agent).apiKey)
  const modelKey = clanker.secretBindings.find((binding) => keyVars.has(binding.envVar))
  if (!modelKey) return { state: 'needs_key', problem: 'No model key: tasks would fail. An admin can edit the agent to choose one.' }
  if (!existingSecretIds.has(modelKey.secretId)) {
    return { state: 'needs_key', problem: 'Its model key was deleted. An admin can edit the agent to choose another.' }
  }
  return null
}

/**
 * Configured, running, and not rejected by its provider last time. A runner
 * that has never run counts as ready once it's configured and running; its
 * first run is what proves the credential.
 */
export function runnerReadiness(clanker: RunnerShape, existingSecretIds: ReadonlySet<string>, lastRun: RunnerLastRun | null): RunnerReadiness {
  const credential = runnerCredentialProblem(clanker, existingSecretIds)
  if (credential) return { ...credential, lastRun }
  if (clanker.status !== 'active' || !clanker.deploymentStrategyId) {
    const problem =
      clanker.status === 'deploying'
        ? 'Starting up.'
        : clanker.status === 'failed'
          ? 'Its compute failed to start. An admin can check the agent.'
          : 'Not started. An admin can start it.'
    return { state: 'not_running', problem, lastRun }
  }
  if (lastRun?.status === 'failed' && lastRun.failureCode === JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID) {
    return {
      state: 'credential_rejected',
      problem: 'The model provider rejected its key on the last run. An admin can replace the key.',
      lastRun,
    }
  }
  return { state: 'ready', problem: null, lastRun }
}
