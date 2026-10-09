import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { SlackIcon } from './SlackIcon'
import { manifest } from '../manifest'
import { SlackInstallSection } from './SlackInstallSection'

const slackFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: SlackIcon,
  AuthSetupSection: SlackInstallSection,
}

export default slackFrontendPlugin
