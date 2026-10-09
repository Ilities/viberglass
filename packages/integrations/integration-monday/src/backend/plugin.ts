import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'

const mondayPlugin: IntegrationPlugin = {
  ...manifest,
}

export default mondayPlugin
