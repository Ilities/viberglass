import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { manifest } from '../manifest'
import { AsanaIcon } from './AsanaIcon'

const asanaFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: AsanaIcon,
  trackerWebhook: {
    tracker: 'Asana',
    item: 'task',
    items: 'tasks',
    setupSteps: [
      'In Asana, get a personal access token and paste it below; Viberglass uses it to comment and to read task details.',
      'Create the webhook with Asana’s API, pointing it at the URL below and at your project’s gid:',
      'curl -X POST https://app.asana.com/api/1.0/webhooks -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d \'{"data": {"resource": "<project gid>", "target": "<the URL below>", "secret": "<any long secret>"}}\'',
      'Asana handshakes the URL and Viberglass keeps the secret, so you don’t paste one into Asana.',
    ],
    events: [
      { value: 'task_added', label: 'Task added', description: 'Creates a task in each space that takes the Asana task.' },
      {
        value: 'task_changed',
        label: 'Task changed',
        description:
          'Updates the linked tasks, marks them done or reopens them as the Asana task is completed or reopened, and brings the task into a space that takes a label added to it.',
      },
      {
        value: 'comment_added',
        label: 'Comment added',
        description: "Posts the comment in the linked tasks' threads; mentioning the bot asks the agent.",
      },
    ],
    botUsernameHint:
      "The Asana name whose @mention in a comment asks the agent, usually the member the connection's personal access token belongs to.",
    botUsernamePlaceholder: 'e.g. Viberglass Bot',
  },
}

export default asanaFrontendPlugin
