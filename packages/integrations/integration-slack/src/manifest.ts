import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'slack',
  label: 'Slack',
  description:
    'Send notifications and create issues directly from Slack channels.',
  category: 'chat',
  status: 'ready',
  authTypes: ['token'],
  configFields: [],
  supports: { issues: true, webhooks: false },
}
