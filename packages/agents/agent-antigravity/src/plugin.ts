import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { AntigravityConfig } from "./config";
import { AntigravityAgent } from "./AntigravityAgent";
import { ANTIGRAVITY_STATE_DIR } from "./antigravitySettings";

const antigravityPlugin: AgentPlugin<AntigravityConfig> = {
  id: "antigravity",
  displayName: "Google Antigravity",

  create(config, logger, gitService?: IAgentGitService) {
    return new AntigravityAgent(config, logger, gitService);
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
      maxMemoryMB: 2048,
      maxCpuPercent: 70,
      maxDiskSpaceMB: 512,
      maxNetworkRequests: 85,
    },
  },

  envAliases: {
    apiKey: ["GEMINI_API_KEY"],
  },

  stateDirs: [ANTIGRAVITY_STATE_DIR],
  stateExcludes: [`${ANTIGRAVITY_STATE_DIR}/acp_token.json`],

  providers: [{ provider: "google", envVar: "GEMINI_API_KEY", default: true }],

  docker: {
    variant: "antigravity",
    repositoryName: "viberator-worker-antigravity",
    scriptImageName: "worker-antigravity",
    supportedAgents: ["antigravity"],
    defaultForAgents: ["antigravity"],
  },
};

export default antigravityPlugin;
