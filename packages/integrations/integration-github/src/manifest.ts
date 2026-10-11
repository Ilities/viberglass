import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'github',
  label: 'GitHub',
  description:
    'Pull requests for your repositories, and GitHub issues as tasks linked to their issue.',
  category: 'scm',
  status: 'ready',
  authTypes: ['token', 'oauth'],
  configFields: [],
  supports: { issues: true, webhooks: true, pullRequests: true },
  credentialUse:
    'Spaces use it to clone, push and open pull requests, and to comment on linked issues.',
  webhookProvider: 'github',
  defaultInboundEvents: ['issues.opened', 'issues.edited', 'issues.labeled', 'issue_comment.created'],
}
