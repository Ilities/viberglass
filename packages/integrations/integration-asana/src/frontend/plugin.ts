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
      'Find the project GID: open the project in Asana and copy the number after /0/ in its address.',
      'Create the webhook with Asana\'s API for that project, using the URL below as its target and the connection\'s personal access token. Viberglass answers the handshake Asana sends.',
      'Copy the X-Hook-Secret from Asana\'s response and paste it below as the webhook secret.',
    ],
    events: [
      { value: 'task_added', label: 'Task added', description: 'Creates a task in each space that takes the Asana task.' },
      {
        value: 'task_changed',
        label: 'Task changed',
        description:
          'Updates the linked tasks, marks them done or reopens them as the Asana task is completed or reopened, and brings the task into a space that takes a tag added to it.',
      },
      {
        value: 'story_added',
        label: 'Comment added',
        description: "Posts the comment in the linked tasks' threads; mentioning the bot asks the agent.",
      },
    ],
    botUsernameHint:
      "The Asana name or email whose @mention in a comment asks the agent, usually the account the connection's personal access token belongs to.",
    botUsernamePlaceholder: 'e.g. Viberglass',
  },
}

export default asanaFrontendPlugin
