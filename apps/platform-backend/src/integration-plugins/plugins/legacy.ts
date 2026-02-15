import type { IntegrationPluginDefinition } from "../plugin";
import { UnimplementedIntegration } from "../UnimplementedIntegration";

export const azurePlugin: IntegrationPluginDefinition = {
  id: "azure",
  label: "Azure DevOps",
  category: "ticketing",
  authTypes: ["token", "oauth"],
  configFields: [],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new UnimplementedIntegration("azure", config),
  status: "stub",
};

export const asanaPlugin: IntegrationPluginDefinition = {
  id: "asana",
  label: "Asana",
  category: "ticketing",
  authTypes: ["token", "oauth"],
  configFields: [],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new UnimplementedIntegration("asana", config),
  status: "stub",
};

export const trelloPlugin: IntegrationPluginDefinition = {
  id: "trello",
  label: "Trello",
  category: "ticketing",
  authTypes: ["api_key", "token"],
  configFields: [],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new UnimplementedIntegration("trello", config),
  status: "stub",
};

export const clickupPlugin: IntegrationPluginDefinition = {
  id: "clickup",
  label: "ClickUp",
  category: "ticketing",
  authTypes: ["api_key", "token"],
  configFields: [],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) =>
    new UnimplementedIntegration("clickup", config),
  status: "stub",
};

export const legacyTicketingPlugins = [
  azurePlugin,
  asanaPlugin,
  trelloPlugin,
  clickupPlugin,
];
