import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'

const githubFrontendPlugin: IntegrationFrontendPlugin = {
  id: 'github',
  trackerWebhook: {
    tracker: 'GitHub',
    item: 'issue',
    items: 'issues',
    setupSteps: [
      "In GitHub, open the repository's (or the organisation's) Settings, Webhooks, and add a webhook.",
      'Use the URL below as the Payload URL, with content type application/json.',
      'Paste the secret below, choose "Let me select individual events", and tick Issues and Issue comments.',
    ],
    events: [
      { value: 'issues.opened', label: 'Issue opened', description: 'Creates a task in each space that takes the issue.' },
      { value: 'issues.edited', label: 'Issue edited', description: "Updates the linked tasks' title and description." },
      { value: 'issues.labeled', label: 'Issue labelled', description: 'Brings the issue into a space that takes the new label.' },
      {
        value: 'issue_comment.created',
        label: 'Issue comment created',
        description: "Posts the comment in the linked tasks' threads; mentioning the bot asks the agent.",
      },
    ],
    botUsernameHint:
      "The GitHub login whose @mention in a comment asks the agent. Comments by this login are never read back, so don't use your own when the token is yours.",
    botUsernamePlaceholder: 'e.g. acme-viberglass',
  },
}

export default githubFrontendPlugin
