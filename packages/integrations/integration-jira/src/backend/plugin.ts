import type { IntegrationPlugin } from '@viberglass/integration-core'
import { JiraIntegration } from './JiraIntegration'
import type { JiraConfig } from './types'

const jiraPlugin: IntegrationPlugin<JiraConfig> = {
  id: 'jira',
  label: 'Jira',
  category: 'ticketing',
  authTypes: ['token', 'basic'],
  configFields: [],
  supports: { issues: true, webhooks: true },
  createIntegration: (config) => new JiraIntegration(config),
  status: 'stub',
  webhookProvider: 'jira',
  defaultInboundEvents: ['issue_created', 'issue_updated', 'comment_created'],
}

export default jiraPlugin
