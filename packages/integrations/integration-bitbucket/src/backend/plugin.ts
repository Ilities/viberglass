import type { IntegrationPlugin } from '@viberglass/integration-core'
import { UnimplementedIntegration } from '@viberglass/integration-core'
import type { BitbucketConfig } from './types'

const bitbucketPlugin: IntegrationPlugin<BitbucketConfig> = {
  id: 'bitbucket',
  label: 'Bitbucket',
  category: 'scm',
  authTypes: ['token', 'oauth'],
  configFields: [
    { key: 'workspace', label: 'Workspace', type: 'string', required: true, description: 'Bitbucket workspace identifier.' },
    { key: 'repo', label: 'Repository', type: 'string', required: true, description: 'Repository slug within the workspace.' },
    { key: 'projectKey', label: 'Project Key', type: 'string', description: 'Optional project key for Bitbucket Server.' },
  ],
  supports: { issues: true, webhooks: true, pullRequests: true },
  createIntegration: (config) => new UnimplementedIntegration('bitbucket', config),
  status: 'stub',
}

export default bitbucketPlugin
