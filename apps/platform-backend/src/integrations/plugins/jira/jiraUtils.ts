import type { IntegrationPluginDefinition } from "../../plugin";
import { JiraIntegration } from "./JiraIntegration";
import type { JiraConfig } from "../../../models/PMIntegration";

export const jiraPlugin: IntegrationPluginDefinition<JiraConfig> = {
  id: "jira",
  label: "Jira",
  category: "ticketing",
  authTypes: ["token", "basic"],
  configFields: [],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new JiraIntegration(config),
  status: "ready",
};
