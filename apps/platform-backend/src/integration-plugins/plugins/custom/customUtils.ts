import type { IntegrationPluginDefinition } from "../../plugin";
import { CustomInboundIntegration } from "./CustomInboundIntegration";

export const customPlugin: IntegrationPluginDefinition = {
  id: "custom",
  label: "Custom Webhook",
  category: "inbound",
  authTypes: [],
  configFields: [],
  supports: {
    issues: false,
    webhooks: true,
    pullRequests: false,
  },
  createIntegration: (config) => new CustomInboundIntegration(config),
  status: "ready",
  webhookProvider: "custom",
  defaultInboundEvents: ["ticket_created"],
};
