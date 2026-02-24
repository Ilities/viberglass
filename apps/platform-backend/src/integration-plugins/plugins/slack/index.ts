import type { IntegrationPluginDefinition } from "../../plugin";
import { SlackIntegration } from "./SlackIntegration";
import type { SlackConfig } from "../../../models/PMIntegration";

export const slackPlugin: IntegrationPluginDefinition<SlackConfig> = {
  id: "slack",
  label: "Slack",
  category: "ticketing",
  authTypes: ["token"],
  configFields: [
    {
      key: "channelId",
      label: "Channel ID",
      type: "string",
      required: true,
      description: "Slack channel ID (for example C12345678).",
    },
    {
      key: "channelName",
      label: "Channel Name",
      type: "string",
      description: "Optional channel name if you prefer using #bugs.",
    },
  ],
  supports: {
    issues: true,
    webhooks: false,
  },
  createIntegration: (config) => new SlackIntegration(config),
  status: "stub",
};
