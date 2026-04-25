import type { IntegrationPlugin } from '@viberglass/integration-core'
import { UnimplementedIntegration } from '@viberglass/integration-core'
import type { LinearConfig } from './types'

const linearPlugin: IntegrationPlugin<LinearConfig> = {
  id: 'linear',
  label: 'Linear',
  category: 'ticketing',
  authTypes: ['api_key', 'token'],
  configFields: [
    { key: 'teamId', label: 'Team ID', type: 'string', required: true, description: 'Linear team ID for issue creation.' },
    { key: 'workflowStateId', label: 'Workflow State ID', type: 'string', description: 'Optional default workflow state.' },
  ],
  supports: { issues: true, webhooks: true },
  createIntegration: (config) => new UnimplementedIntegration('linear', config),
  status: 'stub',
}

export default linearPlugin
