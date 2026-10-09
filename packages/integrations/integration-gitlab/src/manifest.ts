import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'gitlab',
  label: 'GitLab',
  description:
    'GitLab Issues integration with CI/CD pipeline connectivity.',
  category: 'scm',
  status: 'stub',
  authTypes: ['token', 'oauth'],
  configFields: [
    { key: 'projectPath', label: 'Project Path', type: 'string', description: 'Namespace and project name (e.g. group/project).' },
    { key: 'projectId', label: 'Project ID', type: 'string', description: 'Optional GitLab project ID for API lookups.' },
    { key: 'labels', label: 'Default Labels', type: 'string', description: 'Comma-separated labels applied to new issues.' },
  ],
  supports: { issues: true, webhooks: true, pullRequests: true },
  credentialUse:
    'Spaces use it to clone, push and open merge requests.',
}
