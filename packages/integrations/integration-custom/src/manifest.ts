import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'custom',
  label: 'Custom Webhook',
  description:
    'Create tasks from any system with a simple JSON webhook.',
  category: 'inbound',
  status: 'ready',
  authTypes: [],
  configFields: [],
  supports: { issues: false, webhooks: true, pullRequests: false },
  webhookProvider: 'custom',
  defaultInboundEvents: ['ticket_created'],
}
