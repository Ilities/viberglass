import type { IntegrationPluginDefinition } from "../../plugin";
import { ShortcutIntegration } from "./ShortcutIntegration";
import type { ShortcutConfig } from "../../../models/PMIntegration";

export const shortcutPlugin: IntegrationPluginDefinition<ShortcutConfig> = {
  id: "shortcut",
  label: "Shortcut",
  category: "ticketing",
  authTypes: ["api_key"],
  configFields: [],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new ShortcutIntegration(config),
  status: "ready",
  webhookProvider: "shortcut",
  defaultInboundEvents: ["story_created", "comment_created"],
};
