import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { UnimplementedIntegration } from '@viberglass/integration-core'
import type { MondayConfig } from './types'

const mondayPlugin: IntegrationPlugin<MondayConfig> = {
  ...manifest,
  createIntegration: (config) => new UnimplementedIntegration('monday', config),
}

export default mondayPlugin
