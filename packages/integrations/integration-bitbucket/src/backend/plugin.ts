import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { UnimplementedIntegration } from '@viberglass/integration-core'
import type { BitbucketConfig } from './types'

const bitbucketPlugin: IntegrationPlugin<BitbucketConfig> = {
  ...manifest,
  createIntegration: (config) => new UnimplementedIntegration('bitbucket', config),
}

export default bitbucketPlugin
