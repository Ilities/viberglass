import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { AsanaIcon } from './AsanaIcon'
import { manifest } from '../manifest'

const asanaFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: AsanaIcon,
  trackerWebhook: {
    tracker: 'Asana',
    item: 'task',
    items: 'tasks',
    setupSteps: [
      'Note the Asana project id: the number in the project URL.',
      'Create the webhook with Asana, as the member the connection uses: POST https://app.asana.com/api/1.0/webhooks with data[resource] set to the project id and data[target] set to the URL below.',
      'Asana checks the URL with a handshake, and Viberglass keeps the secret Asana sends, so there is no secret to paste.',
    ],
    events: [
      { value: 'task_added', label: 'Task added', description: 'Creates a task in each space that takes the Asana task.' },
      {
        value: 'task_changed',
        label: 'Task changed',
        description: 'Updates the linked tasks, and marks them done or reopens them as the Asana task is completed or reopened.',
      },
      {
        value: 'story_added',
        label: 'Comment added',
        description: "Posts the comment in the linked tasks' threads; mentioning the bot asks the agent.",
      },
    ],
    botUsernameHint: 'The Asana name whose @mention in a comment asks the agent, usually the member the connection\'s token belongs to.',
    botUsernamePlaceholder: 'e.g. Viberglass',
  },
}

export default asanaFrontendPlugin
