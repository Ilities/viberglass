import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'shortcut',
  label: 'Shortcut',
  description:
    'New Shortcut stories become tasks; comments reach the task, and the plan, pull request and done come back to the story.',
  category: 'ticketing',
  status: 'ready',
  authTypes: ['api_key'],
  configFields: [],
  supports: { issues: true, webhooks: true },
  credentialUse:
    'Viberglass uses it to comment on the Shortcut stories tasks are linked to. Use an API token of the member set as the bot.',
  webhookProvider: 'shortcut',
  defaultInboundEvents: ['story_created', 'story_updated', 'comment_created'],
}
