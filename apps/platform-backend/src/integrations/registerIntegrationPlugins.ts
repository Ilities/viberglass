import { IntegrationRegistry } from "@viberglass/integration-core";
import { configuredIntegrationPlugins } from "./configuredIntegrationPlugins";

export function buildIntegrationRegistry(): IntegrationRegistry {
  const registry = new IntegrationRegistry();
  for (const plugin of configuredIntegrationPlugins) registry.register(plugin);
  return registry;
}

export const integrationRegistry = buildIntegrationRegistry();
