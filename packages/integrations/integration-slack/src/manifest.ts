import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'slack',
  label: 'Slack',
  description:
    'Send notifications and create issues directly from Slack channels.',
  category: 'chat',
  status: 'ready',
  configFields: [
    {
      key: 'botToken',
      label: 'Bot User OAuth Token',
      type: 'secret',
      required: true,
      description: "Under OAuth & Permissions in the Slack app's settings. It starts with xoxb-.",
      placeholder: 'xoxb-…',
    },
    {
      key: 'signingSecret',
      label: 'Signing Secret',
      type: 'secret',
      required: true,
      description: "Under Basic Information in the Slack app's settings. Viberglass checks with it that requests come from Slack.",
    },
  ],
}
