import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'

const gitlabPlugin: IntegrationPlugin = {
  ...manifest,
}

export default gitlabPlugin
