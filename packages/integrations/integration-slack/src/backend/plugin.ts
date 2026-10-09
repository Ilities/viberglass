import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { SlackIntegration } from './SlackIntegration'
import type { SlackConfig } from './types'

const slackPlugin: IntegrationPlugin<SlackConfig> = {
  ...manifest,
  createIntegration: (config) => new SlackIntegration(config),
}

export default slackPlugin
