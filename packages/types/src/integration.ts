/**
 * Integration-related types for the Viberglass platform
 */

import type { TicketSystem } from './common'
import type { AuthCredentialType } from './project'

// Integration category - SCM (source control) or Ticketing (issue tracking)
export type IntegrationCategory = 'scm' | 'ticketing'

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

// Integration with configuration status for a specific project
export interface IntegrationSummary extends IntegrationMetadata {
  configStatus: IntegrationConfigStatus
  configuredAt?: string
  lastTestedAt?: string
  errorMessage?: string
}

// Integration configuration values (stored per project)
export interface IntegrationConfig {
  projectId: string
  integrationId: TicketSystem
  authType: AuthCredentialType
  // Dynamic configuration values based on integration's configFields
  values: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// Request to configure an integration
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
}
