import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { CustomOutboundWebhookSection } from './CustomOutboundWebhookSection'

const customFrontendPlugin: IntegrationFrontendPlugin = {
  id: 'custom',
  SelfManagedOutboundWebhookSection: CustomOutboundWebhookSection,
}

export default customFrontendPlugin
