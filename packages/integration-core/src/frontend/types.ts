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

export interface AuthSetupSectionProps {
  // For OAuth/install flows like Slack - extend as needed
  getBotStatus?: () => Promise<{ configured: boolean }>
}

export interface IntegrationFrontendPlugin {
  id: TicketSystem
  /** Integration-specific inbound webhook UI; undefined = use generic InboundWebhookSection */
  InboundWebhookSection?: ComponentType<InboundWebhookSectionProps>
  /** Additional auth/install section (e.g. Slack OAuth); undefined = show nothing */
  AuthSetupSection?: ComponentType<AuthSetupSectionProps>
}
