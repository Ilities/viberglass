import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'asana',
  label: 'Asana',
  description:
    'New Asana tasks become tasks; comments reach the task, and the plan, pull request and done come back to the task.',
  category: 'ticketing',
  status: 'ready',
  configFields: [],
  credentialUse:
    'Viberglass uses it to read tasks and post comments on the Asana tasks its tasks are linked to. Use a personal access token of the account set as the bot.',
  receivesWebhooks: true,
  defaultInboundEvents: ['task_added', 'task_changed', 'story_added'],
}
