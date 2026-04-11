import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { __PascalName__Config } from "./config";
import { __PascalName__Agent } from "./__PascalName__Agent";

const __name__Plugin: AgentPlugin<__PascalName__Config> = {
  id: "__NAME__",
  displayName: "__DISPLAY_NAME__",

  create(config, logger, gitService?: IAgentGitService) {
    return new __PascalName__Agent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: [
      "python",
      "javascript",
      "typescript",
    ],
    costPerExecution: 0.5,
    averageSuccessRate: 0.80,
    executionTimeLimit: 2700,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 80,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 100,
    },
    // TODO: add agent-specific defaults
  },

  envAliases: {
    apiKey: ["__NAME_UPPER___API_KEY"],
    // endpoint: ["__NAME_UPPER___BASE_URL"],
  },

  stateDir: ".__NAME__",

  // harnessConfigPatterns: ["__NAME__/config.json"],

  docker: {
    variant: "__NAME__",
    repositoryName: "viberator-worker-__NAME__",
    scriptImageName: "worker-__NAME__",
    supportedAgents: ["__NAME__"],
    defaultForAgents: ["__NAME__"],
  },
};

export default __name__Plugin;
