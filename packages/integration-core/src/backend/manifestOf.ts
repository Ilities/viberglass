import type { IntegrationManifest } from '@viberglass/types'
import type { IntegrationPlugin } from './IntegrationPlugin'

/** The plugin's data without its factories, as the API sends it to the frontend. */
export function manifestOf(plugin: IntegrationPlugin): IntegrationManifest {
  return {
    id: plugin.id,
    label: plugin.label,
    description: plugin.description,
    category: plugin.category,
    status: plugin.status,
    authTypes: plugin.authTypes,
    configFields: plugin.configFields,
    supports: plugin.supports,
    credentialUse: plugin.credentialUse,
    webhookProvider: plugin.webhookProvider,
    defaultInboundEvents: plugin.defaultInboundEvents,
  }
}
