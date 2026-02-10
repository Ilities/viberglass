import type { WebhookProvider } from '@/service/api/webhook-api'

export interface WebhookProviderSetupInstructions {
  targetLabel: string
  tip?: string
}

export interface WebhookProviderFormDefinition {
  id: WebhookProvider
  label: string
  projectIdLabel?: string
  projectIdDescription: string
  projectIdPlaceholder: string
  validateProjectId?: (projectId: string) => string | null
  allowedEvents: readonly string[]
  defaultAllowedEvents?: readonly string[]
  setupInstructions?: WebhookProviderSetupInstructions
}

export const DEFAULT_WEBHOOK_PROVIDER_DEFINITIONS: readonly WebhookProviderFormDefinition[] = [
  {
    id: 'github',
    label: 'GitHub',
    projectIdDescription: 'GitHub repository in format: owner/repo (e.g., facebook/react)',
    projectIdPlaceholder: 'owner/repo',
    validateProjectId: (projectId) =>
      /^[\w-]+\/[\w.-]+$/.test(projectId) ? null : 'Must be in format: owner/repo',
    allowedEvents: ['issues.opened', 'issue_comment.created'],
    defaultAllowedEvents: ['issues.opened'],
    setupInstructions: {
      targetLabel: 'GitHub repository',
      tip: 'In GitHub, go to Settings > Webhooks > Add webhook to configure these settings.',
    },
  },
  {
    id: 'jira',
    label: 'Jira',
    projectIdDescription: 'Jira project key (e.g., PROJ)',
    projectIdPlaceholder: 'PROJ',
    allowedEvents: ['issue_created', 'issue_updated', 'issue_deleted'],
    defaultAllowedEvents: ['issue_created'],
    setupInstructions: {
      targetLabel: 'Jira project',
    },
  },
]
