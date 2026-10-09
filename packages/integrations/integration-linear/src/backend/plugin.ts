import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'

const linearPlugin: IntegrationPlugin = {
  ...manifest,
}

export default linearPlugin
