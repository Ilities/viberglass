import type { IntegrationManifest } from '@viberglass/types'

export const manifest: IntegrationManifest = {
  id: 'github',
  label: 'GitHub',
  description:
    'Pull requests for your repositories, and GitHub issues as tasks linked to their issue.',
  category: 'scm',
  status: 'ready',
  configFields: [],
  credentialUse:
    'Spaces use it to clone, push and open pull requests, and to comment on linked issues.',
  receivesWebhooks: true,
  defaultInboundEvents: ['issues.opened', 'issues.edited', 'issues.labeled', 'issues.closed', 'issues.reopened', 'issue_comment.created'],
}
