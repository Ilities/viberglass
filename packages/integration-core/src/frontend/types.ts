import type { TicketSystem } from '@viberglass/types'
import type { ComponentType } from 'react'

export interface IntegrationWebhookDelivery {
  id: string
  provider: string
  webhookConfigId: string | null
  deliveryId: string
  eventType: string
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  retryable: boolean
  errorMessage: string | null
  ticketId: string | null
  projectId: string | null
  createdAt: string
  processedAt: string | null
}

export interface IntegrationInboundWebhookConfig {
  id: string
  integrationId: string
  webhookUrl: string
  webhookSecret: string | null
  hasSecret: boolean
  providerProjectId: string | null
  projectId: string | null
  active: boolean
  autoExecute: boolean
  inboundEvents: string[]
  labelMappings: Record<string, unknown> | null
  events: string[]
  createdAt: string
  updatedAt: string
}

export interface IntegrationOutboundWebhookConfig {
  id: string
  provider: string
  events: string[]
  active: boolean
  hasApiToken: boolean
  providerProjectId: string | null
  projectId?: string | null
  name?: string
  targetUrl?: string
  method?: 'POST' | 'PUT' | 'PATCH'
  headers?: Record<string, string>
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'header'
    username?: string
    headerName?: string
    hasToken?: boolean
    hasPassword?: boolean
    hasHeaderValue?: boolean
  }
  hasSigningSecret?: boolean
  signatureAlgorithm?: 'sha256' | 'sha1' | null
  retryPolicy?: {
    maxAttempts: number
    backoffMs: number
    maxBackoffMs: number
  }
  createdAt: string
  updatedAt: string
}

export interface IntegrationOutboundWebhookTestResult {
  success: boolean
  message: string
  statusCode?: number
}

// Shared project type used in section props
export interface IntegrationProject {
  id: string
  name: string
  slug?: string
}

// Props shared by all inbound webhook sections (GitHub, Jira, Shortcut, Custom, etc.)
export interface InboundWebhookSectionProps {
  autoExecute: boolean
  deliveries: IntegrationWebhookDelivery[]
  hasInboundChanges: boolean
  inboundEvents: string[]
  inboundWebhooks: IntegrationInboundWebhookConfig[]
  isLoadingDeliveries: boolean
  isLoadingWebhook: boolean
  isSavingWebhook: boolean
  projects: IntegrationProject[] | null
  selectedInboundConfig: IntegrationInboundWebhookConfig | null
  selectedInboundConfigId: string | null
  selectedInboundProjectId: string | null
  selectedInboundProviderProjectId: string | null
  showSecret: boolean
  // GitHub-specific optional fields
  githubAutoExecuteMode?: 'matching_events' | 'label_gated'
  githubRequiredLabels?: string[]
  onGitHubAutoExecuteModeChange?: (mode: 'matching_events' | 'label_gated') => void
  onGitHubRequiredLabelsChange?: (labels: string[]) => void
  // Callbacks
  onAutoExecuteChange: (value: boolean) => void
  onCopyWebhookSecret: () => void
  onCopyWebhookUrl: (url: string) => void
  onCreateInboundWebhook: () => void
  onDeleteInboundWebhook: () => void
  onGenerateSecret: () => void
  onInboundProjectChange: (projectId: string | null) => void
  onProviderProjectIdChange: (projectId: string | null) => void
  onRefreshDeliveries: () => void
  onRetryDelivery: (deliveryId: string) => void
  onSaveWebhook: () => void
  onSelectInboundWebhook: (configId: string) => void
  onToggleInboundEvent: (eventType: string, enabled: boolean) => void
  onToggleSecretVisibility: () => void
}

// Props for controlled outbound webhook sections (GitHub, Jira, Shortcut)
export interface OutboundWebhookSectionProps {
  isSavingWebhook: boolean
  outboundApiToken: string
  outboundWebhook: { providerProjectId: string | null; hasApiToken: boolean } | null
  /** Provider-specific project mapping (e.g. "owner/repo" for GitHub, project key for Jira) */
  providerProjectMapping?: string | null
  onOutboundApiTokenChange: (token: string) => void
  onSaveOutboundWebhook: () => void
}

// Props for self-managed outbound webhook sections (Custom)
export interface SelfManagedOutboundWebhookSectionProps {
  integrationEntityId?: string
  projects?: IntegrationProject[] | null
  onGetOutboundWebhooks: (integrationEntityId: string) => Promise<IntegrationOutboundWebhookConfig[]>
  onSaveOutboundWebhook: (
    integrationEntityId: string,
    data: Record<string, unknown>,
    existingId?: string
  ) => Promise<IntegrationOutboundWebhookConfig>
  onDeleteOutboundWebhook: (integrationEntityId: string, webhookId: string) => Promise<void>
  onTestOutboundWebhook: (
    integrationEntityId: string,
    webhookId: string,
    eventType?: string
  ) => Promise<IntegrationOutboundWebhookTestResult>
}

export interface AuthSetupSectionProps {
  // For OAuth/install flows like Slack - extend as needed
  getBotStatus?: () => Promise<{ configured: boolean }>
}

export interface IntegrationFrontendPlugin {
  id: TicketSystem
  /** Integration-specific inbound webhook UI; undefined = use generic InboundWebhookSection */
  InboundWebhookSection?: ComponentType<InboundWebhookSectionProps>
  /** Integration-specific outbound webhook UI (controlled); undefined = use generic OutboundWebhookSection */
  OutboundWebhookSection?: ComponentType<OutboundWebhookSectionProps>
  /** Integration-specific self-managed outbound webhook UI (e.g. Custom); overrides OutboundWebhookSection */
  SelfManagedOutboundWebhookSection?: ComponentType<SelfManagedOutboundWebhookSectionProps>
  /** Additional auth/install section (e.g. Slack OAuth); undefined = show nothing */
  AuthSetupSection?: ComponentType<AuthSetupSectionProps>
}
