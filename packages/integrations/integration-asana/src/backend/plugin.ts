import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { AsanaCommenter } from './AsanaCommenter'
import { AsanaWebhookReceiver } from './AsanaWebhookReceiver'
import { checkAsanaConnection } from './checkAsanaConnection'
import type { AsanaConfig } from './types'

const asanaPlugin: IntegrationPlugin<AsanaConfig> = {
  ...manifest,
  checkConnection: checkAsanaConnection,
  createCommenter: (config) => new AsanaCommenter(config),
  webhook: new AsanaWebhookReceiver(),
}

export default asanaPlugin
