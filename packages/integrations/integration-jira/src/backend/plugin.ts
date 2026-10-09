import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { JiraCommenter } from './JiraCommenter'
import { JiraIntegration } from './JiraIntegration'
import { JiraWebhookReceiver } from './JiraWebhookReceiver'
import type { JiraConfig } from './types'

const jiraPlugin: IntegrationPlugin<JiraConfig> = {
  ...manifest,
  createIntegration: (config) => new JiraIntegration(config),
  createCommenter: (config) => new JiraCommenter(config),
  webhook: new JiraWebhookReceiver(),
}

export default jiraPlugin
