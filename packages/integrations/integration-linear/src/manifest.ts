import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'linear',
  label: 'Linear',
  description:
    'Streamlined issue tracking with Linear. Perfect for modern product teams.',
  category: 'ticketing',
  status: 'stub',
  authTypes: ['api_key', 'token'],
  configFields: [
    { key: 'teamId', label: 'Team ID', type: 'string', required: true, description: 'Linear team ID for issue creation.' },
    { key: 'workflowStateId', label: 'Workflow State ID', type: 'string', description: 'Optional default workflow state.' },
  ],
  supports: { issues: true, webhooks: true },
}
