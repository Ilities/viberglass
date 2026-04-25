import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { SlackInstallSection } from './SlackInstallSection'

const slackFrontendPlugin: IntegrationFrontendPlugin = {
  id: 'slack',
  AuthSetupSection: SlackInstallSection,
}

export default slackFrontendPlugin
