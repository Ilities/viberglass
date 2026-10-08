import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'

const shortcutFrontendPlugin: IntegrationFrontendPlugin = {
  id: 'shortcut',
  trackerWebhook: {
    tracker: 'Shortcut',
    item: 'story',
    items: 'stories',
    setupSteps: [
      'In Shortcut, open Settings, Integrations, Webhooks, and add a webhook.',
      'Use the URL below and paste the secret below. Shortcut sends story and comment changes to it.',
    ],
    events: [
      { value: 'story_created', label: 'Story created', description: 'Creates a task in each space that takes the story.' },
      {
        value: 'story_updated',
        label: 'Story updated',
        description: 'Updates the linked tasks, and brings the story into a space that takes a label added to it.',
      },
      {
        value: 'comment_created',
        label: 'Comment created',
        description: "Posts the comment in the linked tasks' threads; mentioning the bot asks the agent.",
      },
    ],
    botUsernameHint:
      "The Shortcut mention name whose @mention in a comment asks the agent, usually the member the connection's API token belongs to.",
    botUsernamePlaceholder: 'e.g. viberglass',
  },
}

export default shortcutFrontendPlugin
