import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { manifest } from '../manifest'
import { AsanaIcon } from './AsanaIcon'

// Add trackerWebhook when spaces take its issues as tasks, or AuthSetupSection
// when it's connected by installing an app.
const asanaFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: AsanaIcon,
}

export default asanaFrontendPlugin
