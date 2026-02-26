import type { IntegrationPluginDefinition } from "../plugin";
import { UnimplementedIntegration } from "../UnimplementedIntegration";
import type { GitLabConfig } from "../../models/PMIntegration";

export const gitlabPlugin: IntegrationPluginDefinition<GitLabConfig> = {
  id: "gitlab",
  label: "GitLab",
  category: "scm",
  authTypes: ["token", "oauth"],
  configFields: [
    {
      key: "projectPath",
      label: "Project Path",
      type: "string",
      description: "Namespace and project name (e.g. group/project).",
    },
    {
      key: "projectId",
      label: "Project ID",
      type: "string",
      description: "Optional GitLab project ID for API lookups.",
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
  createIntegration: (config) => new UnimplementedIntegration("gitlab", config),
  status: "stub",
};
