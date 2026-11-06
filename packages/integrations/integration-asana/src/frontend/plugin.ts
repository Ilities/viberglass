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
      'In Asana, open the project and copy its project GID from the project URL.',
      'Create a webhook for the project using the URL below as its target and the connection personal access token. Asana verifies the URL during setup; Viberglass completes this automatically.',
    ],
    events: [
      { value: 'task_added', label: 'Task added', description: 'Creates a task in each space that takes Asana tasks.' },
      { value: 'task_changed', label: 'Task changed', description: 'Updates linked task titles and descriptions, mirrors completion changes, and fetches comments from task activity.' },
      { value: 'story_added', label: 'Comment added', description: "Posts comments in the linked tasks' threads; mentioning the bot asks the agent." },
      { value: 'story_changed', label: 'Comment changed', description: 'Reads edits to comments in the linked task threads.' },
    ],
    botUsernameHint: "The Asana member name whose comments ask the agent; Viberglass ignores comments posted by the token's owner.",
    botUsernamePlaceholder: 'e.g. Viberglass',
  },
}

export default asanaFrontendPlugin
