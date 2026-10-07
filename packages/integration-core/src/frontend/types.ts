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
  planNewIssues: boolean
  botUsername: string | null
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
  /** Whether the agent writes the plan for each new issue; off, the task waits to be asked. */
  planNewIssues: boolean
  /** The tracker account whose mention in a comment asks the agent. */
  botUsername: string
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
  githubPlanNewIssuesMode?: 'matching_events' | 'label_gated'
  githubRequiredLabels?: string[]
  onGitHubPlanNewIssuesModeChange?: (mode: 'matching_events' | 'label_gated') => void
  onGitHubRequiredLabelsChange?: (labels: string[]) => void
  // Callbacks
  onPlanNewIssuesChange: (value: boolean) => void
  onBotUsernameChange: (value: string) => void
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
