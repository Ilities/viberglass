import type { IntegrationPlugin } from '@viberglass/integration-core'
import { CustomInboundIntegration } from './CustomInboundIntegration'

const customPlugin: IntegrationPlugin = {
  id: 'custom',
  label: 'Custom Webhook',
  category: 'inbound',
  authTypes: [],
  configFields: [],
  supports: { issues: false, webhooks: true, pullRequests: false },
  createIntegration: (config) => new CustomInboundIntegration(config),
  status: 'ready',
  webhookProvider: 'custom',
  defaultInboundEvents: ['ticket_created'],
}

export default customPlugin
