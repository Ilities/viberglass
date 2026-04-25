import type { IntegrationPlugin } from '@viberglass/integration-core'
import { ShortcutIntegration } from './ShortcutIntegration'
import type { ShortcutConfig } from './types'

const shortcutPlugin: IntegrationPlugin<ShortcutConfig> = {
  id: 'shortcut',
  label: 'Shortcut',
  category: 'ticketing',
  authTypes: ['api_key'],
  configFields: [],
  supports: { issues: true, webhooks: true },
  createIntegration: (config) => new ShortcutIntegration(config),
  status: 'ready',
  webhookProvider: 'shortcut',
  defaultInboundEvents: ['story_created', 'comment_created'],
}

export default shortcutPlugin
