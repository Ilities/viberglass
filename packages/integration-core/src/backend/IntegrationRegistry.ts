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

  /** The provider an integration's webhooks are stored under: its id, when it receives them. */
  getWebhookProvider(system: string): string | null {
    const plugin = this.plugins.get(system)
    return plugin?.receivesWebhooks ? plugin.id : null
  }

  getDefaultInboundEvents(provider: string): string[] {
    return this.plugins.get(provider)?.defaultInboundEvents ?? ['*']
  }
}
