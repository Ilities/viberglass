import { isSupportedAgentType } from './workerImages'
import type { AgentType } from './clanker'
import { isModelProviderId, type ModelProviderId } from './modelProviders'
import agentProviderCatalogData from './agentProviderCatalog.json'

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
  // Agents the platform can't select yet (e.g. Pi) stay out until they can.
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
