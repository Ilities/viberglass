import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { MondayIcon } from './MondayIcon'
import { manifest } from '../manifest'

const mondayFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: MondayIcon,
}

export default mondayFrontendPlugin
