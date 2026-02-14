/**
 * Project-related types
 */

import { TicketSystem } from './common'

// Worker settings that can be configured at project level
export interface ProjectWorkerSettings {
  maxChanges?: number
  testRequired?: boolean
  codingStandards?: string
  runTests?: boolean
  testCommand?: string
  maxExecutionTime?: number
}

export interface ProjectScmConfig {
  projectId: string
  integrationId: string
  integrationSystem?: TicketSystem
  sourceRepository: string
  baseBranch: string
  pullRequestRepository?: string | null
  pullRequestBaseBranch?: string | null
  branchNameTemplate?: string | null
  integrationCredentialId?: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertProjectScmConfigRequest {
  integrationId: string
  sourceRepository: string
  baseBranch?: string
  pullRequestRepository?: string | null
  pullRequestBaseBranch?: string | null
  branchNameTemplate?: string | null
  integrationCredentialId?: string | null
}

// Authentication credential types
export type AuthCredentialType = 'api_key' | 'oauth' | 'basic' | 'token'

// Flexible authentication credentials for different systems
export interface AuthCredentials {
  type: AuthCredentialType
  apiKey?: string
  username?: string
  password?: string
  token?: string
  clientId?: string
  clientSecret?: string
  refreshToken?: string
  baseUrl?: string // For on-premise installations
}

// Legacy project credentials - will be removed after migration to top-level integrations
/** @deprecated Project credentials are now stored in the integrations table */
export interface ProjectCredentials extends AuthCredentials {}

// Project configuration
export interface Project {
  id: string
  name: string
  slug: string
  /**
   * @deprecated Use linked integrations instead. This field will be removed.
   * The project's primary ticketing integration determines the ticket system.
   */
  ticketSystem: TicketSystem
  /**
   * @deprecated Use linked integrations instead. This field will be removed.
   * Credentials are now stored in the top-level integrations table.
   */
  credentials: AuthCredentials
  webhookUrl?: string | null
  autoFixEnabled: boolean
  autoFixTags: string[]
  /**
   * @deprecated Use linked integrations instead. This field will be removed.
   * Custom field mappings are now stored per-integration.
   */
  customFieldMappings: Record<string, string>
  repositoryUrl?: string | null
  repositoryUrls?: string[]
  scmConfig?: ProjectScmConfig | null
  agentInstructions?: string | null
  workerSettings?: ProjectWorkerSettings | null
  /**
   * ID of the primary ticketing integration for this project.
   * Replaces the ambiguous isPrimary flag on project_integrations.
   */
  primaryTicketingIntegrationId?: string | null
  /**
   * ID of the primary SCM integration for this project.
   * Replaces the ambiguous isPrimary flag on project_integrations.
   */
  primaryScmIntegrationId?: string | null
  createdAt: string
  updatedAt: string
}

// Request body for creating a project
export interface CreateProjectRequest {
  name: string
  /**
   * @deprecated Use linked integrations instead.
   */
  ticketSystem?: TicketSystem | null
  /**
   * @deprecated Use linked integrations instead.
   */
  credentials?: AuthCredentials | null
  webhookUrl?: string | null
  autoFixEnabled?: boolean
  autoFixTags?: string[]
  /**
   * @deprecated Use linked integrations instead.
   */
  customFieldMappings?: Record<string, string>
  repositoryUrl?: string | null
  repositoryUrls?: string[]
  agentInstructions?: string | null
  workerSettings?: ProjectWorkerSettings | null
}

// Request body for updating a project
export interface UpdateProjectRequest {
  name?: string
  /**
   * @deprecated Use linked integrations instead.
   */
  ticketSystem?: TicketSystem | null
  /**
   * @deprecated Use linked integrations instead.
   */
  credentials?: AuthCredentials | null
  webhookUrl?: string | null
  autoFixEnabled?: boolean
  autoFixTags?: string[]
  /**
   * @deprecated Use linked integrations instead.
   */
  customFieldMappings?: Record<string, string>
  repositoryUrl?: string | null
  repositoryUrls?: string[]
  agentInstructions?: string | null
  workerSettings?: ProjectWorkerSettings | null
}

// Project summary for list views
export interface ProjectSummary {
  id: string
  name: string
  slug: string
  /**
   * @deprecated Use primaryTicketingIntegrationId instead.
   */
  ticketSystem: TicketSystem
  autoFixEnabled: boolean
  repositoryUrl?: string | null
  repositoryUrls?: string[]
  agentInstructions?: string | null
  /**
   * ID of the primary ticketing integration for this project.
   * Replaces the deprecated ticketSystem field.
   */
  primaryTicketingIntegrationId?: string | null
  createdAt: string
  updatedAt: string
  // Stats (computed on frontend or via separate endpoint)
  stats?: {
    openBugs: number
    resolvedThisWeek: number
    autoFixRequests: number
  }
}

// Project with its linked integrations
export interface ProjectWithIntegrations extends Project {
  integrations: Array<{
    id: string
    name: string
    system: TicketSystem
    isPrimary: boolean
    isActive: boolean
  }>
}
