import type { InboundWebhookSectionProps, IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import type { ComponentType } from 'react'
import { GitHubInboundWebhookSection } from './GitHubInboundWebhookSection'
import { GitHubOutboundWebhookSection } from './GitHubOutboundWebhookSection'

const githubFrontendPlugin: IntegrationFrontendPlugin = {
  id: 'github',
  // Type cast required: GitHubInboundWebhookSection has required GitHub-specific props
  // (githubAutoExecuteMode, githubRequiredLabels) that InboundWebhookSectionProps has as optional.
  // The parent page is responsible for passing these when rendering the GitHub section.
  InboundWebhookSection: GitHubInboundWebhookSection as unknown as ComponentType<InboundWebhookSectionProps>,
  OutboundWebhookSection: GitHubOutboundWebhookSection,
}

export default githubFrontendPlugin
