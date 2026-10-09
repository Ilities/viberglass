import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { CustomInboundIntegration } from './CustomInboundIntegration'
import { CustomWebhookReceiver } from './CustomWebhookReceiver'

const customPlugin: IntegrationPlugin = {
  ...manifest,
  createIntegration: (config) => new CustomInboundIntegration(config),
  webhook: new CustomWebhookReceiver(),
}

export default customPlugin
