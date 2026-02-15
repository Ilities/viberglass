import type { IntegrationPluginDefinition } from "../plugin";
import { UnimplementedIntegration } from "../UnimplementedIntegration";
import type { MondayConfig } from "../../models/PMIntegration";

export const mondayPlugin: IntegrationPluginDefinition<MondayConfig> = {
  id: "monday",
  label: "Monday.com",
  category: "ticketing",
  authTypes: ["api_key"],
  configFields: [
    {
      key: "boardId",
      label: "Board ID",
      type: "string",
      required: true,
      description: "Target board for incoming tickets.",
    },
    {
      key: "groupId",
      label: "Group ID",
      type: "string",
      description: "Optional group within the board.",
    },
  ],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new UnimplementedIntegration("monday", config),
  status: "stub",
};
