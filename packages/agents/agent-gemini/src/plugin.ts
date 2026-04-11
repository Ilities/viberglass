import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { GeminiConfig } from "./config";
import { GeminiCLIAgent } from "./GeminiCLIAgent";

const geminiCLIPlugin: AgentPlugin<GeminiConfig> = {
  id: "gemini-cli",
  displayName: "Gemini CLI",

  create(config, logger, gitService?: IAgentGitService) {
    return new GeminiCLIAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: [
      "python",
      "javascript",
      "typescript",
      "java",
      "kotlin",
      "swift",
    ],
    costPerExecution: 0.35,
    averageSuccessRate: 0.77,
    executionTimeLimit: 2100,
    resourceLimits: {
      maxMemoryMB: 1536,
      maxCpuPercent: 70,
      maxDiskSpaceMB: 512,
      maxNetworkRequests: 85,
    },
    approvalMode: "yolo",
  },

  envAliases: {
    apiKey: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  },

  stateDir: ".gemini",

  docker: {
    variant: "gemini",
    repositoryName: "viberator-worker-gemini",
    scriptImageName: "worker-gemini",
    supportedAgents: ["gemini-cli"],
    defaultForAgents: ["gemini-cli"],
  },
};

export default geminiCLIPlugin;
