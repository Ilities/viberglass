import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { UnimplementedIntegration } from '@viberglass/integration-core'
import type { LinearConfig } from './types'

const linearPlugin: IntegrationPlugin<LinearConfig> = {
  ...manifest,
  createIntegration: (config) => new UnimplementedIntegration('linear', config),
}

export default linearPlugin
