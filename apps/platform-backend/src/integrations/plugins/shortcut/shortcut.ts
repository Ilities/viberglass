import type { IntegrationPluginDefinition } from "../../plugin";
import { ShortcutIntegration } from "./ShortcutIntegration";
import type { ShortcutConfig } from "../../../models/PMIntegration";

export const shortcutPlugin: IntegrationPluginDefinition<ShortcutConfig> = {
  id: "shortcut",
  label: "Shortcut",
  category: "ticketing",
  authTypes: ["api_key"],
  configFields: [
    {
      key: "projectId",
      label: "Project ID",
      type: "string",
      description: "Optional project ID for scoping stories.",
    },
    {
      key: "workflowStateId",
      label: "Workflow State ID",
      type: "string",
      description: "Optional workflow state for new stories.",
    },
  ],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new ShortcutIntegration(config),
  status: "ready",
};
