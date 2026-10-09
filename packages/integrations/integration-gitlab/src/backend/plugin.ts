import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { UnimplementedIntegration } from '@viberglass/integration-core'
import type { GitLabConfig } from './types'

const gitlabPlugin: IntegrationPlugin<GitLabConfig> = {
  ...manifest,
  createIntegration: (config) => new UnimplementedIntegration('gitlab', config),
}

export default gitlabPlugin
