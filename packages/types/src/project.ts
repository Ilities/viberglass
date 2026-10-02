/**
 * Project-related types
 */

import { TicketOrigin, TicketSystem } from './common'
import type { SpaceCapabilities } from './spaceAccess'

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
  // Integration-specific extensions (owner, repo, instanceUrl, ...) flow
  // through this bag, keeping subtypes assignable to Record<string, unknown>
  [key: string]: unknown
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
  ticketSystem: TicketOrigin
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
  archivedAt?: string | null
  /** Only its members (and admins) see a private space. */
  isPrivate: boolean
  /** Starts every task key in the space (WEB-42); fixed once the space exists. */
  keyPrefix: string
  /** Owner of new tasks unless someone else is picked; falls back to whoever creates the task. */
  defaultOwnerId?: string | null
  /** Added as reviewers to every new task; the plan waits on them. */
  defaultReviewerIds: string[]
  /** The caller's place in the space; set when one space is fetched. */
  viewerAccess?: SpaceCapabilities
  createdAt: string
  updatedAt: string
}

export type ProjectReadinessState = 'ready' | 'missing' | 'invalid' | 'unavailable'

export type ProjectReadinessCode =
  | 'configure_repository'
  | 'select_scm_credential'
  | 'replace_expired_scm_credential'
  | 'start_agent_runner'
  | 'configure_agent_credentials'

export interface ProjectReadinessCheck {
  /** `demo`: the demo workspace's space, which is sample data and never runs. */
  key: 'repository' | 'scmCredential' | 'agentRunner' | 'agentCredentials' | 'demo'
  label: string
  state: ProjectReadinessState
  code?: ProjectReadinessCode
  summary: string
  remediationUrl?: string
}

export interface ProjectReadiness {
  projectId: string
  automationAvailable: boolean
  /** Whether any task in the project has run yet; the space home offers a first task until one has. */
  hasRuns: boolean
  checks: ProjectReadinessCheck[]
}

// Request body for creating a project
export interface CreateProjectRequest {
  name: string
  /**
   * @deprecated Use linked integrations instead.
   */
  ticketSystem?: TicketOrigin | null
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
  agentInstructions?: string | null
  workerSettings?: ProjectWorkerSettings | null
}

// Request body for updating a project
export interface UpdateProjectRequest {
  name?: string
  /**
   * @deprecated Use linked integrations instead.
   */
  ticketSystem?: TicketOrigin | null
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
  agentInstructions?: string | null
  workerSettings?: ProjectWorkerSettings | null
  /** ID of the primary ticketing integration; null clears it. */
  primaryTicketingIntegrationId?: string | null
  /** ID of the primary SCM integration; null clears it. */
  primaryScmIntegrationId?: string | null
  isPrivate?: boolean
  defaultOwnerId?: string | null
  defaultReviewerIds?: string[]
}

// Project summary for list views
export interface ProjectSummary {
  id: string
  name: string
  slug: string
  /**
   * @deprecated Use primaryTicketingIntegrationId instead.
   */
  ticketSystem: TicketOrigin
  autoFixEnabled: boolean
  agentInstructions?: string | null
  /**
   * ID of the primary ticketing integration for this project.
   * Replaces the deprecated ticketSystem field.
   */
  primaryTicketingIntegrationId?: string | null
  archivedAt?: string | null
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
