/**
 * Clanker-related types
 * Clankers are individual viberator app worker configurations that do agentic tasks
 */

import type { RunnerReadiness } from './runnerReadiness'
import type { ModelEndpointSelection } from './modelEndpoints'
import type { SecretBinding } from './secret'

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

export const SUPPORTED_AGENT_TYPES: AgentType[] = [
  'claude-code',
  'qwen-cli',
  'codex',
  'opencode',
  'kimi-code',
  'antigravity',
  'mistral-vibe',
  'pi',
  // Deterministic e2e test agent. Accepted by the API; its plugin is test only, so it isn't offered.
  'fake',
]

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
