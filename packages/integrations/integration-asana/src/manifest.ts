import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'asana',
  label: 'Asana',
  description: 'New Asana tasks become issues; comments reach the task, and Viberglass posts updates back to Asana.',
  category: 'ticketing',
  status: 'ready',
  configFields: [],
  credentialUse: 'Viberglass uses the personal access token to read Asana tasks and comments, and post comments as the token owner.',
  receivesWebhooks: true,
  defaultInboundEvents: ['task_added', 'task_changed', 'story_added', 'story_changed'],
}
