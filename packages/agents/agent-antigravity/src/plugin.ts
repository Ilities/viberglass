import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { AntigravityConfig } from "./config";
import { AntigravityAgent } from "./AntigravityAgent";
import { ANTIGRAVITY_STATE_DIR } from "./antigravitySettings";

const antigravityPlugin: AgentPlugin<AntigravityConfig> = {
  id: "antigravity",
  label: "Google Antigravity",
  description: "Google's agent harness on Gemini models, with a selectable model.",
  logo: "logo.svg",
  telemetryProvider: "gcp.gemini",

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

  agentEnv: ["AGY_ACP_DISABLE_WORKSPACE_TRUST"],

  stateDirs: [ANTIGRAVITY_STATE_DIR],
  stateExcludes: [`${ANTIGRAVITY_STATE_DIR}/acp_token.json`],
  skillDirs: [".gemini/config/skills"],

  settings: [
    {
      key: "model",
      label: "Antigravity Model",
      type: "string",
      description: "Optional Antigravity model id. Leave empty for Antigravity's default.",
      placeholder: "gemini-3.1-pro-high",
      providerDefault: "model",
      env: ["AGY_ACP_DEFAULT_MODEL"],
    },
  ],

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
