import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'monday',
  label: 'Monday.com',
  description:
    'Work operating system for issue and project management.',
  category: 'ticketing',
  status: 'stub',
  authTypes: ['api_key'],
  configFields: [
    { key: 'boardId', label: 'Board ID', type: 'string', required: true, description: 'Target board for incoming tickets.' },
    { key: 'groupId', label: 'Group ID', type: 'string', description: 'Optional group within the board.' },
  ],
  supports: { issues: true, webhooks: true },
}
