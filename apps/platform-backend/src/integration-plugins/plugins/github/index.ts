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
  webhookProvider: "github",
  defaultInboundEvents: ["issues.opened", "issue_comment.created"],
  getProviderProjectId: (config) => {
    const owner = typeof config.owner === "string" ? config.owner : null;
    const repo = typeof config.repo === "string" ? config.repo : null;
    if (owner && repo) {
      return `${owner}/${repo}`;
    }
    return null;
  },
};
