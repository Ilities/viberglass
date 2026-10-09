import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'bitbucket',
  label: 'Bitbucket',
  description:
    'Atlassian Bitbucket issue tracking for teams using Bitbucket Git.',
  category: 'scm',
  status: 'stub',
  authTypes: ['token', 'oauth'],
  configFields: [
    { key: 'workspace', label: 'Workspace', type: 'string', required: true, description: 'Bitbucket workspace identifier.' },
    { key: 'repo', label: 'Repository', type: 'string', required: true, description: 'Repository slug within the workspace.' },
    { key: 'projectKey', label: 'Project Key', type: 'string', description: 'Optional project key for Bitbucket Server.' },
  ],
  supports: { issues: true, webhooks: true, pullRequests: true },
  credentialUse:
    'Spaces use it to clone, push and open pull requests.',
}
