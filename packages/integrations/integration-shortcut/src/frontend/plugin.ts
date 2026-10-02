import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { ShortcutInboundWebhookSection } from './ShortcutInboundWebhookSection'

const shortcutFrontendPlugin: IntegrationFrontendPlugin = {
  id: 'shortcut',
  InboundWebhookSection: ShortcutInboundWebhookSection,
}

export default shortcutFrontendPlugin
