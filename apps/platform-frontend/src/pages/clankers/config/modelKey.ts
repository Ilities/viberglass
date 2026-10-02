import type { Secret } from '@/service/api/secret-api'
import {
  AGENT_PROVIDER_BINDINGS,
  getAgentEnvVarNames,
  getModelProvider,
  type AgentType,
  type ModelProviderId,
  type SecretBinding,
} from '@viberglass/types'
import type { AgentSettings } from './agents'

/** A provider this agent can run, with the env var it reads the key from and the provider's defaults. */
export interface ProviderOption {
  provider: ModelProviderId
  label: string
  envVar: string
  model?: string
  endpoint?: string
}

export function providerOptionsForAgent(agent: AgentType | ''): ProviderOption[] {
  if (!agent) return []
  return AGENT_PROVIDER_BINDINGS.filter((binding) => binding.agent === agent && binding.provider !== 'fake').map(
    (binding) => ({
      provider: binding.provider,
      label: getModelProvider(binding.provider).displayName,
      envVar: binding.envVar,
      model: binding.model,
      endpoint: binding.endpoint,
    }),
  )
}

export interface RunnerKeys {
  provider: ModelProviderId | ''
  /** The binding that gives the agent its model key, if the runner has one. */
  modelKey: SecretBinding | null
  /** Everything else the runner exposes to the agent. */
  extras: SecretBinding[]
}

/**
 * Splits a runner's bindings into its model key and the rest. The model key is the
 * first binding under a variable the agent reads its key from; its provider comes
 * from the secret, or from the variable when only one provider uses it.
 */
export function splitRunnerBindings(bindings: SecretBinding[], secrets: Secret[], agent: AgentType | ''): RunnerKeys {
  if (!agent) return { provider: '', modelKey: null, extras: bindings }

  const keyVars = new Set(getAgentEnvVarNames(agent).apiKey)
  const modelKey = bindings.find((binding) => keyVars.has(binding.envVar)) ?? null
  const extras = bindings.filter((binding) => binding !== modelKey)
  if (!modelKey) return { provider: '', modelKey: null, extras }

  const options = providerOptionsForAgent(agent)
  const secretProvider = secrets.find((secret) => secret.id === modelKey.secretId)?.provider
  const fromSecret = options.find((option) => option.provider === secretProvider)
  const byEnvVar = options.filter((option) => option.envVar === modelKey.envVar)
  const provider = fromSecret?.provider ?? (byEnvVar.length === 1 ? byEnvVar[0].provider : '')
  return { provider, modelKey, extras }
}

/** The keys a runner can use for this provider: those issued by it, and whatever is selected now. */
export function keysForProvider(secrets: Secret[], provider: ModelProviderId | '', selectedId?: string): Secret[] {
  if (!provider) return []
  return secrets.filter((secret) => secret.provider === provider || secret.id === selectedId)
}

type ProviderDefaultField = 'model' | 'endpoint'
type ModelSetting = Exclude<keyof AgentSettings, 'codexAuthMode' | 'codexLoginSecretId'>

/** Which agent setting holds a provider's default model or endpoint. */
const PROVIDER_DEFAULT_FIELDS: Partial<Record<AgentType, Array<[ProviderDefaultField, ModelSetting]>>> = {
  opencode: [
    ['model', 'opencodeModel'],
    ['endpoint', 'opencodeEndpoint'],
  ],
  'qwen-cli': [['endpoint', 'qwenEndpoint']],
  antigravity: [['model', 'antigravityModel']],
  'kimi-code': [
    ['model', 'kimiModel'],
    ['endpoint', 'kimiEndpoint'],
  ],
}

/**
 * Settings after switching provider: a setting still at the old provider's default, empty,
 * or a model named under the old provider (`<provider>/<model>`) takes the new one's; any
 * other value was typed by hand for this provider-neutral setting and survives the switch.
 */
export function settingsForProvider(
  agent: AgentType | '',
  settings: AgentSettings,
  from: ProviderOption | undefined,
  to: ProviderOption | undefined,
): Partial<AgentSettings> {
  const changes: Partial<AgentSettings> = {}
  for (const [defaultField, setting] of (agent && PROVIDER_DEFAULT_FIELDS[agent]) || []) {
    const current = settings[setting]
    const namedUnderOldProvider = defaultField === 'model' && from !== undefined && current.startsWith(`${from.provider}/`)
    if (current === '' || current === (from?.[defaultField] ?? '') || namedUnderOldProvider) {
      changes[setting] = to?.[defaultField] ?? ''
    }
  }
  return changes
}
