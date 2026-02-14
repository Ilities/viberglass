/**
 * Integration-related types for the Viberglass platform
 */

import type { TicketSystem } from './common'
import type { AuthCredentialType } from './project'
import type { SecretLocation } from './secret'

// Integration category - SCM (source control), Ticketing (issue tracking), or Inbound (receives events)
export type IntegrationCategory = 'scm' | 'ticketing' | 'inbound'

// Integration field types for dynamic forms
export type IntegrationFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'secret'

// Option for select/multiselect fields
export interface IntegrationFieldOption {
  label: string
  value: string
}

// Definition of a configuration field for an integration
export interface IntegrationFieldDefinition {
  key: string
  label: string
  type: IntegrationFieldType
  required?: boolean
  description?: string
  options?: IntegrationFieldOption[]
  placeholder?: string
}

// Features supported by an integration
export interface IntegrationSupport {
  issues: boolean
  webhooks?: boolean
  pullRequests?: boolean
}

// Integration configuration status
export type IntegrationConfigStatus = 'configured' | 'not_configured' | 'stub'

// Integration metadata from plugin registry
export interface IntegrationMetadata {
  id: TicketSystem
  label: string
  category: IntegrationCategory
  description: string
  authTypes: AuthCredentialType[]
  configFields: IntegrationFieldDefinition[]
  supports: IntegrationSupport
  status: 'ready' | 'stub'
}

// Top-level Integration entity (stored in integrations table)
export interface Integration {
  id: string
  name: string
  system: TicketSystem
  // Non-sensitive configuration values (baseUrl, owner, repo, etc.)
  // Credentials are stored separately in the secrets system
  config: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// Link between a project and an integration (stored in project_integrations join table)
export interface ProjectIntegrationLink {
  id: string
  projectId: string
  integrationId: string
  isPrimary: boolean
  createdAt: string
}

// Project integration link with category information
export interface ProjectIntegrationLinkWithCategory extends ProjectIntegrationLink {
  category: IntegrationCategory
}

// SCM credential stored per integration
export interface IntegrationCredential {
  id: string
  integrationId: string
  name: string
  credentialType: 'token' | 'ssh_key' | 'oauth' | 'basic'
  secretId: string
  secretLocation: SecretLocation
  isDefault: boolean
  description?: string | null
  expiresAt?: string | null
  lastUsedAt?: string | null
  createdAt: string
  updatedAt: string
}

// Request to create a new integration credential
export interface CreateIntegrationCredentialRequest {
  integrationId: string
  name: string
  /** @deprecated Credential type is now auto-determined by the backend based on integration */
  credentialType?: 'token' | 'ssh_key' | 'oauth' | 'basic'
  /** ID of an existing secret to link (if not provided, a new secret will be created) */
  secretId?: string
  secretLocation?: SecretLocation
  secretValue?: string
  secretPath?: string | null
  isDefault?: boolean
  description?: string | null
  expiresAt?: string | null
}

// Request to update an integration credential
export interface UpdateIntegrationCredentialRequest {
  name?: string
  description?: string | null
  expiresAt?: string | null
  isDefault?: boolean
  secretValue?: string
}

// Integration with configuration status for a specific project
export interface IntegrationSummary extends IntegrationMetadata {
  configStatus: IntegrationConfigStatus
  configuredAt?: string
  lastTestedAt?: string
  errorMessage?: string
}

// Integration configuration values stored per project (legacy - will be removed)
// Now replaced by the top-level Integration entity
/** @deprecated Use Integration instead */
export interface IntegrationConfig {
  projectId: string
  integrationId: TicketSystem
  authType: AuthCredentialType
  // Dynamic configuration values based on integration's configFields
  values: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// Request to create a new integration
export interface CreateIntegrationRequest {
  name: string
  system: TicketSystem
  // Non-sensitive configuration (baseUrl, owner, repo, etc.)
  config: Record<string, unknown>
}

// Request to update an integration
export interface UpdateIntegrationRequest {
  name?: string
  // Non-sensitive configuration (baseUrl, owner, repo, etc.)
  config?: Record<string, unknown>
  isActive?: boolean
}

// Request to link an integration to a project
export interface LinkIntegrationToProjectRequest {
  integrationId: string
  isPrimary?: boolean
}

// Request to unlink an integration from a project
export interface UnlinkIntegrationFromProjectRequest {
  integrationId: string
}

// Request to configure an integration (legacy - use CreateIntegrationRequest or UpdateIntegrationRequest instead)
/** @deprecated Use CreateIntegrationRequest or UpdateIntegrationRequest instead */
export interface ConfigureIntegrationRequest {
  authType: AuthCredentialType
  values: Record<string, unknown>
}

// Response from testing an integration connection
export interface TestIntegrationResponse {
  success: boolean
  message: string
  details?: {
    accountName?: string
    workspaceName?: string
    accessibleProjects?: string[]
    errorCode?: string
  }
}

// Integration icon mapping (for frontend use)
export const INTEGRATION_ICONS: Record<TicketSystem, string> = {
  jira: 'jira',
  linear: 'linear',
  github: 'github',
  gitlab: 'gitlab',
  bitbucket: 'bitbucket',
  azure: 'azure',
  asana: 'asana',
  trello: 'trello',
  monday: 'monday',
  clickup: 'clickup',
  shortcut: 'shortcut',
  slack: 'slack',
  custom: 'custom',
}

// Integration descriptions (for frontend use)
export const INTEGRATION_DESCRIPTIONS: Record<TicketSystem, string> = {
  jira: 'Create and sync issues with Atlassian Jira. Supports Jira Cloud and Server.',
  linear: 'Streamlined issue tracking with Linear. Perfect for modern product teams.',
  github: 'Native GitHub Issues integration with webhook support and PR linking.',
  gitlab: 'GitLab Issues integration with CI/CD pipeline connectivity.',
  bitbucket: 'Atlassian Bitbucket issue tracking for teams using Bitbucket Git.',
  azure: 'Azure DevOps Boards integration for Microsoft-centric workflows.',
  asana: 'Project management and issue tracking with Asana.',
  trello: 'Kanban-style issue organization using Trello boards.',
  monday: 'Work operating system for issue and project management.',
  clickup: 'All-in-one productivity platform for issue tracking.',
  shortcut: 'Project management for software teams (formerly Clubhouse).',
  slack: 'Send notifications and create issues directly from Slack channels.',
  custom: 'Receive tickets from any external system via a simple JSON webhook.',
}
