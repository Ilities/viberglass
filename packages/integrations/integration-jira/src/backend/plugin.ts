import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { checkJiraConnection } from './checkJiraConnection'
import { JiraCommenter } from './JiraCommenter'
import { JiraWebhookReceiver } from './JiraWebhookReceiver'
import type { JiraConfig } from './types'

const jiraPlugin: IntegrationPlugin<JiraConfig> = {
  ...manifest,
  checkConnection: checkJiraConnection,
  createCommenter: (config) => new JiraCommenter(config),
  webhook: new JiraWebhookReceiver(),
}

export default jiraPlugin
