import type { IntegrationPluginDefinition } from "../../plugin";
import { JiraIntegration } from "./JiraIntegration";
import type { JiraConfig } from "../../../models/PMIntegration";

export const jiraPlugin: IntegrationPluginDefinition<JiraConfig> = {
  id: "jira",
  label: "Jira",
  category: "ticketing",
  authTypes: ["token", "basic"],
  configFields: [
    {
      key: "instanceUrl",
      label: "Instance URL",
      type: "string",
      required: true,
      description: "Base URL of your Jira instance (e.g., https://your-domain.atlassian.net or https://jira.company.com).",
    },
    {
      key: "projectKey",
      label: "Project Key",
      type: "string",
      required: true,
      description: "Jira project key (e.g., ENG, PROJ).",
    },
    {
      key: "issueTypeId",
      label: "Issue Type ID",
      type: "string",
      description: "Optional issue type ID for created tickets. Defaults to 'Bug'.",
    },
  ],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new JiraIntegration(config),
  status: "ready",
};
