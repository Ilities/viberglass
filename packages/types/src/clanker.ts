/**
 * Clanker-related types
 * Clankers are individual viberator app worker configurations that do agentic tasks
 */

import type { RunnerReadiness } from './runnerReadiness'
import type { ModelEndpointSelection } from './modelEndpoints'
import type { SecretBinding } from './secret'
import agentPluginCatalog from './agentPluginCatalog.json'

// Status of a clanker
export type ClankerStatus = 'active' | 'inactive' | 'deploying' | 'failed'

// Agent types supported by the system
export type AgentType =
  | 'claude-code'
  | 'qwen-cli'
  | 'codex'
  | 'opencode'
  | 'kimi-code'
  | 'antigravity'
  | 'mistral-vibe'
  | 'pi'
  | 'fake'

export const DEFAULT_AGENT_TYPE: AgentType = 'claude-code'

export const SUPPORTED_AGENT_TYPES: AgentType[] = [
  'claude-code',
  'qwen-cli',
  'codex',
  'opencode',
  'kimi-code',
  'antigravity',
  'mistral-vibe',
  'pi',
  // Deterministic e2e test agent. Accepted by the API, not offered in AGENT_OPTIONS.
  'fake',
]

const builtAgents = new Set(agentPluginCatalog.map((entry) => entry.agent))

/** The supported harnesses this build includes; new runners can only use these. */
export const AVAILABLE_AGENT_TYPES: AgentType[] = SUPPORTED_AGENT_TYPES.filter((agent) => builtAgents.has(agent))

export const AGENT_LABELS: Record<AgentType, string> = {
  'claude-code': 'Claude Code',
  'qwen-cli': 'Qwen CLI',
  codex: 'OpenAI Codex',
  opencode: 'OpenCode',
  'kimi-code': 'Kimi Code',
  antigravity: 'Google Antigravity',
  'mistral-vibe': 'Mistral Vibe',
  pi: 'Pi',
  fake: 'Fake (end-to-end tests)',
}

export interface AgentOption {
  value: AgentType
  label: string
  recommended?: boolean
}

const ALL_AGENT_OPTIONS: AgentOption[] = [
  { value: 'claude-code', label: AGENT_LABELS['claude-code'] },
  { value: 'qwen-cli', label: AGENT_LABELS['qwen-cli'] },
  { value: 'codex', label: AGENT_LABELS.codex },
  { value: 'opencode', label: AGENT_LABELS.opencode },
  { value: 'kimi-code', label: AGENT_LABELS['kimi-code'] },
  { value: 'antigravity', label: AGENT_LABELS.antigravity },
  { value: 'mistral-vibe', label: AGENT_LABELS['mistral-vibe'] },
  { value: 'pi', label: AGENT_LABELS.pi },
]

export const AGENT_OPTIONS: AgentOption[] = ALL_AGENT_OPTIONS.filter((option) => builtAgents.has(option.value))

export function getAgentLabel(agent?: AgentType | null): string {
  if (!agent) {
    return AGENT_LABELS[DEFAULT_AGENT_TYPE]
  }

  return AGENT_LABELS[agent] || AGENT_LABELS[DEFAULT_AGENT_TYPE]
}

// Deployment strategy entity
export interface DeploymentStrategy {
  id: string
  name: string
  description?: string | null
  configSchema?: Record<string, unknown> | null
  createdAt: string
}

// Config file entity
export interface ClankerConfigFile {
  id: string
  clankerId: string
  fileType: string
  content: string
  storageUrl?: string | null
  createdAt: string
  updatedAt: string
}

// Full clanker entity
export interface Clanker {
  id: string
  name: string
  slug: string
  description?: string | null
  deploymentStrategyId?: string | null
  deploymentStrategy?: DeploymentStrategy | null
  deploymentConfig?: Record<string, unknown> | null
  configFiles: ClankerConfigFile[]
  agent?: AgentType | null
  secretBindings: SecretBinding[]
  /** Workspace MCP servers the runner's agent gets. */
  mcpServerIds: string[]
  /** Workspace skills the runner's agent gets. */
  skillIds: string[]
  modelEndpoint?: ModelEndpointSelection | null
  status: ClankerStatus
  statusMessage?: string | null
  /** Whether it can take a task; set by the API, which knows its secrets and runs. */
  readiness?: RunnerReadiness
  createdAt: string
  updatedAt: string
}

// Config file input for create/update
export interface ConfigFileInput {
  fileType: string
  content: string
}

// Request body for creating a clanker
export interface CreateClankerRequest {
  name: string
  description?: string | null
  deploymentStrategyId?: string | null
  deploymentConfig?: Record<string, unknown> | null
  configFiles?: ConfigFileInput[]
  agent?: AgentType | null
  secretBindings?: SecretBinding[]
  mcpServerIds?: string[]
  modelEndpoint?: ModelEndpointSelection | null
  skillIds?: string[]
}

// Request body for updating a clanker
export interface UpdateClankerRequest {
  name?: string
  description?: string | null
  deploymentStrategyId?: string | null
  deploymentConfig?: Record<string, unknown> | null
  configFiles?: ConfigFileInput[]
  agent?: AgentType | null
  secretBindings?: SecretBinding[]
  mcpServerIds?: string[]
  modelEndpoint?: ModelEndpointSelection | null
  skillIds?: string[]
  status?: ClankerStatus
  statusMessage?: string | null
}

// Clanker summary for list views
export interface ClankerSummary {
  id: string
  name: string
  slug: string
  description?: string | null
  deploymentStrategy?: DeploymentStrategy | null
  status: ClankerStatus
  configFileTypes: string[]
  createdAt: string
  updatedAt: string
}

// Health check result for a clanker
export interface ClankerHealthStatus {
  clankerId: string
  isHealthy: boolean
  status: 'healthy' | 'unhealthy' | 'unknown'
  checks: {
    resourceExists: boolean        // Clanker record exists
    deploymentConfigured: boolean  // Has strategy + config
    invokerAvailable: boolean      // isAvailable() check
  }
  message?: string
  lastChecked: string              // ISO timestamp
}

// Request body for creating a deployment strategy
export interface CreateDeploymentStrategyRequest {
  name: string
  description?: string | null
  configSchema?: Record<string, unknown> | null
}

// Request body for updating a deployment strategy
export interface UpdateDeploymentStrategyRequest {
  name?: string
  description?: string | null
  configSchema?: Record<string, unknown> | null
}
