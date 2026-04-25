import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { JiraInboundWebhookSection } from './JiraInboundWebhookSection'
import { JiraOutboundWebhookSection } from './JiraOutboundWebhookSection'

const jiraFrontendPlugin: IntegrationFrontendPlugin = {
  id: 'jira',
  InboundWebhookSection: JiraInboundWebhookSection,
  OutboundWebhookSection: JiraOutboundWebhookSection,
}

export default jiraFrontendPlugin
