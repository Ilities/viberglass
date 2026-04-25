import type { TicketSystem } from '@viberglass/types'
import type { IntegrationFrontendPlugin } from './types'

export class IntegrationFrontendRegistry {
  private readonly plugins = new Map<TicketSystem, IntegrationFrontendPlugin>()

  register(plugin: IntegrationFrontendPlugin): this {
    this.plugins.set(plugin.id, plugin)
    return this
  }

  get(id: TicketSystem): IntegrationFrontendPlugin | undefined {
    return this.plugins.get(id)
  }

  list(): IntegrationFrontendPlugin[] {
    return Array.from(this.plugins.values())
  }
}
