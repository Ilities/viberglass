import type { IntegrationPluginDefinition } from "../plugin";
import { UnimplementedIntegration } from "../UnimplementedIntegration";
import type { JiraConfig } from "../../models/PMIntegration";

export const jiraPlugin: IntegrationPluginDefinition<JiraConfig> = {
  id: "jira",
  label: "Jira",
  category: "ticketing",
  authTypes: ["api_key", "basic", "oauth"],
  configFields: [
    {
      key: "instanceUrl",
      label: "Instance URL",
      type: "string",
      required: true,
      description: "Base URL of your Jira instance.",
    },
    {
      key: "projectKey",
      label: "Project Key",
      type: "string",
      required: true,
      description: "Jira project key (e.g. ENG).",
    },
    {
      key: "issueTypeId",
      label: "Issue Type ID",
      type: "string",
      description: "Optional issue type ID for created tickets.",
    },
  ],
  supports: {
    issues: true,
    webhooks: true,
  },
  createIntegration: (config) => new UnimplementedIntegration("jira", config),
  status: "stub",
};
