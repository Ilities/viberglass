import type { IntegrationPlugin } from '@viberglass/integration-core'
import { JiraCommenter } from './JiraCommenter'
import { JiraIntegration } from './JiraIntegration'
import type { JiraConfig } from './types'

const jiraPlugin: IntegrationPlugin<JiraConfig> = {
  id: 'jira',
  label: 'Jira',
  category: 'ticketing',
  authTypes: ['token', 'basic'],
  configFields: [
    { key: 'instanceUrl', label: 'Site URL', type: 'string', required: true, description: 'Your Jira site, for example https://acme.atlassian.net.' },
    { key: 'email', label: 'Account email', type: 'string', description: 'The email of the account the API token belongs to. Needed for Jira Cloud.' },
  ],
  supports: { issues: true, webhooks: true },
  createIntegration: (config) => new JiraIntegration(config),
  createCommenter: (config) => new JiraCommenter(config),
  status: 'ready',
  webhookProvider: 'jira',
  defaultInboundEvents: ['issue_created', 'issue_updated', 'comment_created'],
}

export default jiraPlugin
