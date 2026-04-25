import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'

// This plugin has no custom section components — the integration detail page
// will fall back to the generic InboundWebhookSection and OutboundWebhookSection.
// Add InboundWebhookSection, OutboundWebhookSection, or AuthSetupSection here
// when you need integration-specific UI.
const __name__FrontendPlugin: IntegrationFrontendPlugin = {
  id: '__name__',
}

export default __name__FrontendPlugin
