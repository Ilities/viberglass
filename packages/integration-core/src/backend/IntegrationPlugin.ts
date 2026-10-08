import type {
  AuthCredentialType,
  AuthCredentials,
  IntegrationCategory,
  TicketSystem,
} from '@viberglass/types'
import type { TrackerCommenter } from './TrackerCommenter'
import type { PMIntegration } from './types'

export type { IntegrationCategory }

export type IntegrationFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'secret'

export interface IntegrationFieldOption {
  label: string
  value: string
}

export interface IntegrationFieldDefinition {
  key: string
  label: string
  type: IntegrationFieldType
  required?: boolean
  description?: string
  options?: IntegrationFieldOption[]
}

export interface IntegrationSupport {
  issues: boolean
  webhooks?: boolean
  pullRequests?: boolean
}

export interface WebhookEventDefinition {
  name: string
  description?: string
}

export interface IntegrationPlugin<Config = object> {
  id: TicketSystem
  label: string
  category: IntegrationCategory
  authTypes: AuthCredentialType[]
  configFields: IntegrationFieldDefinition[]
  supports: IntegrationSupport
  createIntegration(config: AuthCredentials & Config): PMIntegration
  /** For trackers: posts back to the issues their tasks are linked to, with the connection's credentials. */
  createCommenter?(config: AuthCredentials & Config): TrackerCommenter
  status?: 'ready' | 'stub'
  webhookProvider?: string
  defaultInboundEvents?: string[]
}
