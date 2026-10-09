import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { LinearIcon } from './LinearIcon'
import { manifest } from '../manifest'

const linearFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: LinearIcon,
}

export default linearFrontendPlugin
