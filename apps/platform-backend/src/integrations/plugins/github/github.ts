import type { IntegrationPluginDefinition } from "../../plugin";
import { GitHubIntegration } from "./GitHubIntegration";
import type { GitHubConfig } from "../../../models/PMIntegration";

export const githubPlugin: IntegrationPluginDefinition<GitHubConfig> = {
  id: "github",
  label: "GitHub",
  category: "scm",
  authTypes: ["token", "oauth"],
  configFields: [
    {
      key: "owner",
      label: "Repository Owner",
      type: "string",
      required: true,
      description: "GitHub organization or user name.",
    },
    {
      key: "repo",
      label: "Repository Name",
      type: "string",
      required: true,
      description: "Repository slug without the owner.",
    },
    {
      key: "labels",
      label: "Default Labels",
      type: "string",
      description: "Comma-separated labels applied to new issues.",
    },
  ],
  supports: {
    issues: true,
    webhooks: true,
    pullRequests: true,
  },
  createIntegration: (config) => new GitHubIntegration(config),
  status: "ready",
};
