import type { IntegrationPluginDefinition } from "../plugin";
import { UnimplementedIntegration } from "../UnimplementedIntegration";
import type { BitbucketConfig } from "../../models/PMIntegration";

export const bitbucketPlugin: IntegrationPluginDefinition<BitbucketConfig> = {
  id: "bitbucket",
  label: "Bitbucket",
  category: "scm",
  authTypes: ["token", "oauth"],
  configFields: [
    {
      key: "workspace",
      label: "Workspace",
      type: "string",
      required: true,
      description: "Bitbucket workspace identifier.",
    },
    {
      key: "repo",
      label: "Repository",
      type: "string",
      required: true,
      description: "Repository slug within the workspace.",
    },
    {
      key: "projectKey",
      label: "Project Key",
      type: "string",
      description: "Optional project key for Bitbucket Server.",
    },
  ],
  supports: {
    issues: true,
    webhooks: true,
    pullRequests: true,
  },
  createIntegration: (config) =>
    new UnimplementedIntegration("bitbucket", config),
  status: "stub",
};
