import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: '__name__',
  label: '__DISPLAY_NAME__',
  description: 'TODO: one sentence for the connections page.',
  category: 'ticketing', // Change to 'scm', 'inbound' or 'chat' as appropriate
  status: 'ready',
  authTypes: ['token'],
  // Settings the connection screen edits; leave empty when there are none.
  configFields: [
    // {
    //   key: 'instanceUrl',
    //   label: 'Site URL',
    //   type: 'string',
    //   required: true,
    //   description: 'Your __DISPLAY_NAME__ site.',
    // },
  ],
  supports: {
    issues: true,
    webhooks: false,
    pullRequests: false,
  },
  // Set when the connection holds a token: what Viberglass uses it for.
  // credentialUse: 'Viberglass uses it to comment on the __DISPLAY_NAME__ issues tasks are linked to.',
  // Set when the connection receives webhooks.
  // webhookProvider: '__name__',
}
