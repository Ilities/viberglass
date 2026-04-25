import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { ShortcutInboundWebhookSection } from './ShortcutInboundWebhookSection'
import { ShortcutOutboundWebhookSection } from './ShortcutOutboundWebhookSection'

const shortcutFrontendPlugin: IntegrationFrontendPlugin = {
  id: 'shortcut',
  InboundWebhookSection: ShortcutInboundWebhookSection,
  OutboundWebhookSection: ShortcutOutboundWebhookSection,
}

export default shortcutFrontendPlugin
