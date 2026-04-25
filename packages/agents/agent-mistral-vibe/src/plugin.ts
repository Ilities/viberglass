import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { MistralVibeConfig } from "./config";
import { MistralVibeAgent } from "./MistralVibeAgent";

const mistralVibePlugin: AgentPlugin<MistralVibeConfig> = {
  id: "mistral-vibe",
  displayName: "Mistral Vibe",

  create(config, logger, gitService?: IAgentGitService) {
    return new MistralVibeAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: ["python", "javascript", "typescript", "rust", "go"],
    costPerExecution: 0.4,
    averageSuccessRate: 0.8,
    executionTimeLimit: 2400,
    resourceLimits: {
      maxMemoryMB: 1792,
      maxCpuPercent: 75,
      maxDiskSpaceMB: 768,
      maxNetworkRequests: 90,
    },
    maxTokens: 4000,
    temperature: 0.1,
  },

  envAliases: {
    apiKey: ["MISTRAL_API_KEY"],
  },

  // vibe-acp stores sessions in ~/.vibe/logs/session/ (VIBE_HOME defaults to ~/.vibe/)
  stateDir: ".vibe/logs/session",

  docker: {
    variant: "mistral",
    repositoryName: "viberator-worker-mistral",
    scriptImageName: "worker-mistral",
    supportedAgents: ["mistral-vibe"],
    defaultForAgents: ["mistral-vibe"],
  },
};

export default mistralVibePlugin;
