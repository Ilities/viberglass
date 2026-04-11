import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { KimiCodeConfig } from "./config";
import { KimiCodeAgent } from "./KimiCodeAgent";

const kimiCodePlugin: AgentPlugin<KimiCodeConfig> = {
  id: "kimi-code",
  displayName: "Kimi Code",

  create(config, logger, gitService?: IAgentGitService) {
    return new KimiCodeAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: [
      "python",
      "javascript",
      "typescript",
      "java",
      "go",
      "cpp",
      "rust",
    ],
    costPerExecution: 0.45,
    averageSuccessRate: 0.83,
    executionTimeLimit: 3000,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 90,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 120,
    },
    model: "kimi-k2",
    temperature: 0.0,
  },

  envAliases: {
    apiKey: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
    endpoint: ["KIMI_BASE_URL", "KIMI_CODE_ENDPOINT", "MOONSHOT_BASE_URL"],
  },

  stateDir: ".kimi",

  docker: {
    variant: "kimi",
    repositoryName: "viberator-worker-kimi",
    scriptImageName: "worker-kimi",
    supportedAgents: ["kimi-code"],
    defaultForAgents: ["kimi-code"],
  },
};

export default kimiCodePlugin;
