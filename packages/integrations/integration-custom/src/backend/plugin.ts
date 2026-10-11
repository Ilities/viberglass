import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { CustomWebhookReceiver } from './CustomWebhookReceiver'

const customPlugin: IntegrationPlugin = {
  ...manifest,
  webhook: new CustomWebhookReceiver(),
}

export default customPlugin
