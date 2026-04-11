import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { PiConfig } from "./config";
import { PiCodingAgent } from "./PiCodingAgent";

const piPlugin: AgentPlugin<PiConfig> = {
  id: "pi",
  displayName: "Pi Coding Agent",

  create(config, logger, gitService?: IAgentGitService) {
    return new PiCodingAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: [
      "python",
      "javascript",
      "typescript",
      "java",
      "go",
      "rust",
      "cpp",
    ],
    costPerExecution: 0.5,
    averageSuccessRate: 0.83,
    executionTimeLimit: 2700,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 80,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 100,
    },
  },

  envAliases: {
    apiKey: ["ANTHROPIC_API_KEY"],
  },

  stateDir: ".pi",

  harnessConfigPatterns: ["pi/models.json"],

  docker: {
    variant: "pi",
    repositoryName: "viberator-worker-pi",
    scriptImageName: "worker-pi",
    supportedAgents: ["pi"],
    defaultForAgents: ["pi"],
  },
};

export default piPlugin;
