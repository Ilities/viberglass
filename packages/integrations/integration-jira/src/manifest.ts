import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'jira',
  label: 'Jira',
  description:
    'New Jira issues become tasks; comments reach the task, and the plan, pull request and done come back to the issue.',
  category: 'ticketing',
  status: 'ready',
  authTypes: ['token', 'basic'],
  configFields: [
    { key: 'instanceUrl', label: 'Site URL', type: 'string', required: true, description: 'Your Jira site, for example https://acme.atlassian.net.' },
    { key: 'email', label: 'Account email', type: 'string', description: 'The email of the account the API token belongs to. Needed for Jira Cloud.' },
  ],
  supports: { issues: true, webhooks: true },
  credentialUse:
    'Viberglass uses it to comment on the Jira issues tasks are linked to. Use an API token of the account set as the bot.',
  webhookProvider: 'jira',
  defaultInboundEvents: ['issue_created', 'issue_updated', 'comment_created'],
}
