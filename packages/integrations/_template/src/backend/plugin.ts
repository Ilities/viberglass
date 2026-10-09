import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import type { __PascalName__Config } from './types'
import { __PascalName__Integration } from './__PascalName__Integration'

const __name__Plugin: IntegrationPlugin<__PascalName__Config> = {
  ...manifest,
  createIntegration(config) {
    return new __PascalName__Integration(config)
  },
}

export default __name__Plugin
