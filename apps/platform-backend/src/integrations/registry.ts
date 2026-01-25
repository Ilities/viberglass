import type { TicketSystem } from "@viberglass/types";
import type { IntegrationPluginDefinition } from "./plugin";
import { builtInIntegrationPlugins } from "./plugins";

export class TicketingIntegrationRegistry {
  private readonly plugins = new Map<
    TicketSystem,
    IntegrationPluginDefinition
  >();

  register(plugin: IntegrationPluginDefinition): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Integration plugin already registered: ${plugin.id}`);
    }

    this.plugins.set(plugin.id, plugin);
  }

  registerAll(plugins: IntegrationPluginDefinition<any>[]): void {
    plugins.forEach((plugin) => this.register(plugin));
  }

  get(id: TicketSystem): IntegrationPluginDefinition | undefined {
    return this.plugins.get(id);
  }

  list(): IntegrationPluginDefinition[] {
    return Array.from(this.plugins.values());
  }

  listIds(): TicketSystem[] {
    return Array.from(this.plugins.keys());
  }
}

export const integrationRegistry = new TicketingIntegrationRegistry();
integrationRegistry.registerAll(builtInIntegrationPlugins);
