import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'asana',
  label: 'Asana',
  description: 'TODO: one sentence for the connections page.',
  category: 'ticketing', // Change to 'scm', 'inbound' or 'chat' as appropriate
  status: 'ready',
  // Settings the connection screen edits; leave empty when there are none.
  configFields: [
    // {
    //   key: 'instanceUrl',
    //   label: 'Site URL',
    //   type: 'string',
    //   required: true,
    //   description: 'Your Asana site.',
    // },
  ],
  // Set when the connection holds a token: what Viberglass uses it for.
  // credentialUse: 'Viberglass uses it to comment on the Asana issues tasks are linked to.',
  // Set when the connection receives webhooks.
  // receivesWebhooks: true,
}
