import { getAgentSettingFields } from './agentCatalog'
import { pickSettingValues } from './agentSettings'
import type { AgentType, Clanker, ClankerStatus } from './clanker'
import { isClankerConfigV1 } from './clankerConfig'
import type { RunnerReadiness } from './runnerReadiness'

/** An agent as everyone who sees runs knows it: what it is and whether it can run, none of its configuration. */
export interface AgentDirectoryEntry {
  id: string
  name: string
  slug: string
  agent: AgentType | null
  /** The model it's set to use; null runs the harness's default. */
  model: string | null
  /** Status, readiness and deployable are left out on a demo instance. */
  status?: ClankerStatus
  readiness?: RunnerReadiness | null
  /** Whether it has compute to run on; one without can't take a task. */
  deployable?: boolean
}

/** The runner's value for the setting that takes a provider's default model or endpoint. */
export function providerDefaultSetting(agent: string, agentConfig: unknown, kind: 'model' | 'endpoint'): string | null {
  const fields = getAgentSettingFields(agent)
  const field = fields.find((candidate) => candidate.providerDefault === kind)
  return field ? (pickSettingValues(fields, agentConfig)[field.key] ?? null) : null
}

/** The model a runner is set to use: its model endpoint's, else the harness setting's. */
export function runnerModel(clanker: Pick<Clanker, 'agent' | 'deploymentConfig' | 'modelEndpoint'>): string | null {
  if (clanker.modelEndpoint?.model) return clanker.modelEndpoint.model
  const config = isClankerConfigV1(clanker.deploymentConfig) ? clanker.deploymentConfig : null
  return providerDefaultSetting(clanker.agent ?? '', config?.agent, 'model')
}

export function toAgentDirectoryEntry(clanker: Clanker): AgentDirectoryEntry {
  return {
    id: clanker.id,
    name: clanker.name,
    slug: clanker.slug,
    agent: clanker.agent ?? null,
    model: runnerModel(clanker),
    status: clanker.status,
    readiness: clanker.readiness ?? null,
    deployable: Boolean(clanker.deploymentStrategyId),
  }
}
