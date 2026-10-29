import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { checkAsanaConnection } from './checkAsanaConnection'
import { AsanaCommenter } from './AsanaCommenter'
import { AsanaWebhookReceiver } from './webhook/AsanaWebhookReceiver'

const asanaPlugin: IntegrationPlugin = {
  ...manifest,
  checkConnection: checkAsanaConnection,
  createCommenter: (config) => new AsanaCommenter(config),
  webhook: new AsanaWebhookReceiver(),
}

export default asanaPlugin
