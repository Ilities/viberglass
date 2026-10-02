import { isSupportedAgentType } from './workerImages'
import type { AgentType } from './clanker'
import { isModelProviderId, type ModelProviderId } from './modelProviders'
import agentProviderCatalogData from './agentProviderCatalog.json'
import agentPluginCatalogData from './agentPluginCatalog.json'

/**
 * Which harness runs which provider's keys. Generated from the agent plugins'
 * `providers` declarations (`npm run generate:catalog`); don't edit the JSON.
 */
export interface AgentProviderBinding {
  agent: AgentType
  provider: ModelProviderId
  /** Env var the harness reads the key from; the key's secret is stored under this name. */
  envVar: string
  /** The harness setup picks for this provider's keys. */
  default: boolean
  model?: string
  endpoint?: string
}

function toBinding(entry: (typeof agentProviderCatalogData)[number]): AgentProviderBinding | null {
  // Agents the platform can't select stay out until they can.
  if (!isSupportedAgentType(entry.agent) || !isModelProviderId(entry.provider)) return null
  const { agent, provider, ...rest } = entry
  return { agent, provider, ...rest }
}

export const AGENT_PROVIDER_BINDINGS: readonly AgentProviderBinding[] = agentProviderCatalogData
  .map(toBinding)
  .filter((binding): binding is AgentProviderBinding => binding !== null)

/** The harness setup uses for a key from this provider. */
export function getDefaultAgentBindingForProvider(provider: ModelProviderId): AgentProviderBinding | undefined {
  return AGENT_PROVIDER_BINDINGS.find((binding) => binding.provider === provider && binding.default)
}

/** Env var names a harness reads its model key and endpoint override from. */
export interface AgentEnvVarNames {
  /** The default provider's key first, then the other providers' keys and aliases. */
  apiKey: string[]
  endpoint: string[]
}

/** Generated from the agent plugins' `providers` and `envAliases` declarations. */
export function getAgentEnvVarNames(agent: AgentType): AgentEnvVarNames {
  const bindings = AGENT_PROVIDER_BINDINGS.filter((binding) => binding.agent === agent)
  const aliases = agentPluginCatalogData.find((entry) => entry.agent === agent)
  const apiKey = [
    ...bindings.filter((binding) => binding.default).map((binding) => binding.envVar),
    ...bindings.filter((binding) => !binding.default).map((binding) => binding.envVar),
    ...(aliases?.apiKey ?? []),
  ]
  return {
    apiKey: Array.from(new Set(apiKey)),
    endpoint: Array.from(new Set(aliases?.endpoint ?? [])),
  }
}

/** Config files a harness accepts, as paths relative to its harness config directory (e.g. `pi/models.json`). */
export function getAgentHarnessConfigFiles(agent: AgentType): string[] {
  return agentPluginCatalogData.find((entry) => entry.agent === agent)?.harnessConfigFiles ?? []
}

/** Every harness config file any agent accepts. */
export const HARNESS_CONFIG_FILE_TYPES: readonly string[] = Array.from(
  new Set(agentPluginCatalogData.flatMap((entry) => entry.harnessConfigFiles)),
)
