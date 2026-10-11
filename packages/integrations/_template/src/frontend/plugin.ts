import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { manifest } from '../manifest'
import { __PascalName__Icon } from './__PascalName__Icon'

// Add trackerWebhook when spaces take its issues as tasks, or AuthSetupSection
// when it's connected by installing an app.
const __name__FrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: __PascalName__Icon,
}

export default __name__FrontendPlugin
