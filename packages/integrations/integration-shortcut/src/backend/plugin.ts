import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { ShortcutCommenter } from './ShortcutCommenter'
import { ShortcutIntegration } from './ShortcutIntegration'
import type { ShortcutConfig } from './types'
import { ShortcutWebhookReceiver } from './webhook/ShortcutWebhookReceiver'

const shortcutPlugin: IntegrationPlugin<ShortcutConfig> = {
  ...manifest,
  createIntegration: (config) => new ShortcutIntegration(config),
  createCommenter: (config) => new ShortcutCommenter(config),
  webhook: new ShortcutWebhookReceiver(),
}

export default shortcutPlugin
