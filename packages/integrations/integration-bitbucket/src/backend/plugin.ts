import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'

const bitbucketPlugin: IntegrationPlugin = {
  ...manifest,
}

export default bitbucketPlugin
