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
  | 'codex'
  | 'opencode'
  | 'kimi-code'
  | 'gemini-cli'
  | 'mistral-vibe'

export const DEFAULT_AGENT_TYPE: AgentType = 'claude-code'

export const SUPPORTED_AGENT_TYPES: AgentType[] = [
  'claude-code',
  'qwen-cli',
  'codex',
  'opencode',
  'kimi-code',
  'gemini-cli',
  'mistral-vibe',
]

export const AGENT_LABELS: Record<AgentType, string> = {
  'claude-code': 'Claude Code',
  'qwen-cli': 'Qwen CLI',
  codex: 'OpenAI Codex',
  opencode: 'OpenCode',
  'kimi-code': 'Kimi Code',
  'gemini-cli': 'Gemini CLI',
  'mistral-vibe': 'Mistral Vibe',
}

export const AGENT_OPTIONS: Array<{
  value: AgentType
  label: string
  recommended?: boolean
}> = [
  { value: 'claude-code', label: AGENT_LABELS['claude-code'] },
  { value: 'qwen-cli', label: AGENT_LABELS['qwen-cli'] },
  { value: 'codex', label: AGENT_LABELS.codex },
  { value: 'opencode', label: AGENT_LABELS.opencode },
  { value: 'kimi-code', label: AGENT_LABELS['kimi-code'] },
  { value: 'gemini-cli', label: AGENT_LABELS['gemini-cli'] },
  { value: 'mistral-vibe', label: AGENT_LABELS['mistral-vibe'] },
]

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
