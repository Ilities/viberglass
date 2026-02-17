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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  /**
   * Get webhook provider ID for a given ticket system.
   * Returns null if the system doesn't support webhooks.
   */
  getWebhookProvider(system: string): string | null {
    const plugin = this.plugins.get(system as TicketSystem);
    return plugin?.webhookProvider ?? null;
  }

  /**
   * Get default inbound webhook events for a given webhook provider.
   */
  getDefaultInboundEvents(provider: string): string[] {
    for (const plugin of this.plugins.values()) {
      if (plugin.webhookProvider === provider) {
        return plugin.defaultInboundEvents ?? ["*"];
      }
    }
    return ["*"];
  }

  /**
   * Extract provider-specific project ID from integration config.
   * Falls back to plugin's getProviderProjectId if available.
   */
  getProviderProjectId(
    provider: string,
    config: Record<string, unknown>,
  ): string | null {
    for (const plugin of this.plugins.values()) {
      if (plugin.webhookProvider === provider && plugin.getProviderProjectId) {
        return plugin.getProviderProjectId(config);
      }
    }
    return null;
  }
}

export const integrationRegistry = new TicketingIntegrationRegistry();
integrationRegistry.registerAll(builtInIntegrationPlugins);
