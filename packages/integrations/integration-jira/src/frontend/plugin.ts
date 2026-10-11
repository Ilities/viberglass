import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { JiraIcon } from './JiraIcon'
import { manifest } from '../manifest'

const jiraFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: JiraIcon,
  trackerWebhook: {
    tracker: 'Jira',
    item: 'issue',
    items: 'issues',
    setupSteps: [
      'In Jira, open Settings, System, Webhooks, and create a webhook.',
      'Use the URL below and paste the secret below.',
      'Select the events Issue created, Issue updated and Comment created.',
    ],
    events: [
      { value: 'issue_created', label: 'Issue created', description: 'Creates a task in each space that takes the issue.' },
      {
        value: 'issue_updated',
        label: 'Issue updated',
        description: "Updates the linked tasks, and brings the issue into a space that takes a label added to it.",
      },
      {
        value: 'comment_created',
        label: 'Comment created',
        description: "Posts the comment in the linked tasks' threads; mentioning the bot asks the agent.",
      },
    ],
    botUsernameHint:
      "The Jira account whose @mention in a comment asks the agent: its account ID, or its username on Jira Data Center. Usually the account the connection's API token belongs to.",
    botUsernamePlaceholder: 'e.g. 5b10ac8d82e05b22cc7d4ef5',
  },
}

export default jiraFrontendPlugin
