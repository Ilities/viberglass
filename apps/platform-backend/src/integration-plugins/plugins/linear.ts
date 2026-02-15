import type { IntegrationPluginDefinition } from "../plugin";
import { UnimplementedIntegration } from "../UnimplementedIntegration";
import type { LinearConfig } from "../../models/PMIntegration";

export const linearPlugin: IntegrationPluginDefinition<LinearConfig> = {
  id: "linear",
  label: "Linear",
  category: "ticketing",
  authTypes: ["api_key", "token"],
  configFields: [
    {
      key: "teamId",
      label: "Team ID",
      type: "string",
      required: true,
      description: "Linear team ID for issue creation.",
    },
    {
      key: "workflowStateId",
      label: "Workflow State ID",
      type: "string",
      description: "Optional default workflow state.",
    },
  ],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new UnimplementedIntegration("linear", config),
  status: "stub",
};
