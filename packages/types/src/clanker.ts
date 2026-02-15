/**
 * Clanker-related types
 * Clankers are individual viberator app worker configurations that do agentic tasks
 */

// Status of a clanker
export type ClankerStatus = 'active' | 'inactive' | 'deploying' | 'failed'

// Agent types supported by the system
export type AgentType =
  | 'claude-code'
  | 'qwen-cli'
  | 'qwen-api'
  | 'codex'
  | 'kimi-code'
  | 'gemini-cli'
  | 'mistral-vibe'

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
  secretIds: string[]
  status: ClankerStatus
  statusMessage?: string | null
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
  secretIds?: string[]
}

// Request body for updating a clanker
export interface UpdateClankerRequest {
  name?: string
  description?: string | null
  deploymentStrategyId?: string | null
  deploymentConfig?: Record<string, unknown> | null
  configFiles?: ConfigFileInput[]
  agent?: AgentType | null
  secretIds?: string[]
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
