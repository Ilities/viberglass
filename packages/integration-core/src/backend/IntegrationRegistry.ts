import type { TicketSystem } from '@viberglass/types'
import type { IntegrationPlugin } from './IntegrationPlugin'

export class IntegrationRegistry {
  private readonly plugins = new Map<TicketSystem, IntegrationPlugin>()

  register(plugin: IntegrationPlugin): this {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Integration plugin already registered: ${plugin.id}`)
    }
    this.plugins.set(plugin.id, plugin)
    return this
  }

  get(id: TicketSystem): IntegrationPlugin | undefined {
    return this.plugins.get(id)
  }

  list(): IntegrationPlugin[] {
    return Array.from(this.plugins.values())
  }

  listIds(): TicketSystem[] {
    return Array.from(this.plugins.keys())
  }

  getWebhookProvider(system: string): string | null {
    const plugin = this.plugins.get(system as TicketSystem)
    return plugin?.webhookProvider ?? null
  }

  getDefaultInboundEvents(provider: string): string[] {
    for (const plugin of this.plugins.values()) {
      if (plugin.webhookProvider === provider) {
        return plugin.defaultInboundEvents ?? ['*']
      }
    }
    return ['*']
  }

  getProviderProjectId(provider: string, config: Record<string, unknown>): string | null {
    for (const plugin of this.plugins.values()) {
      if (plugin.webhookProvider === provider && plugin.getProviderProjectId) {
        return plugin.getProviderProjectId(config)
      }
    }
    return null
  }
}
