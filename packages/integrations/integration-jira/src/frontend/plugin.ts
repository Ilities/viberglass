import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { JiraInboundWebhookSection } from './JiraInboundWebhookSection'

const jiraFrontendPlugin: IntegrationFrontendPlugin = {
  id: 'jira',
  InboundWebhookSection: JiraInboundWebhookSection,
}

export default jiraFrontendPlugin
