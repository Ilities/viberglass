import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { checkShortcutConnection } from './checkShortcutConnection'
import { ShortcutCommenter } from './ShortcutCommenter'
import { ShortcutWebhookReceiver } from './webhook/ShortcutWebhookReceiver'

const shortcutPlugin: IntegrationPlugin = {
  ...manifest,
  checkConnection: checkShortcutConnection,
  createCommenter: (config) => new ShortcutCommenter(config),
  webhook: new ShortcutWebhookReceiver(),
}

export default shortcutPlugin
