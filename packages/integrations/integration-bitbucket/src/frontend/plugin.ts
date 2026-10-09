import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { BitbucketIcon } from './BitbucketIcon'
import { manifest } from '../manifest'

const bitbucketFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: BitbucketIcon,
}

export default bitbucketFrontendPlugin
