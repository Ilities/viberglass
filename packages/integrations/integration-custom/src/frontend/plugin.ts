import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { CustomIcon } from './CustomIcon'
import { manifest } from '../manifest'

const customFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: CustomIcon,
}

export default customFrontendPlugin
