import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { checkSlackConnection } from './checkSlackConnection'
import { SlackChatProvider } from './SlackChatProvider'

const slackPlugin: IntegrationPlugin = {
  ...manifest,
  chat: new SlackChatProvider(),
  checkConnection: checkSlackConnection,
}

export default slackPlugin
