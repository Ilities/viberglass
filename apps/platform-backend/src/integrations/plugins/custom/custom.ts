import type { IntegrationPluginDefinition } from "../../plugin";
import { CustomInboundIntegration } from "./CustomInboundIntegration";

export const customPlugin: IntegrationPluginDefinition = {
  id: "custom",
  label: "Custom Webhook",
  category: "inbound",
  authTypes: ["api_key"],
  configFields: [
    {
      key: "name",
      label: "Source Name",
      type: "string",
      required: true,
      description: "A friendly name for the external system sending webhooks.",
    },
  ],
  supports: {
    issues: false,
    webhooks: true,
    pullRequests: false,
  },
  createIntegration: (config) => new CustomInboundIntegration(config),
  status: "ready",
};
