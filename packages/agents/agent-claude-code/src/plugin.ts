import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { ClaudeCodeConfig } from "./config";
import { ClaudeCodeAgent } from "./ClaudeCodeAgent";

const claudeCodePlugin: AgentPlugin<ClaudeCodeConfig> = {
  id: "claude-code",
  displayName: "Claude Code",

  create(config, logger, gitService?: IAgentGitService) {
    return new ClaudeCodeAgent(config, logger, gitService);
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
    averageSuccessRate: 0.85,
    executionTimeLimit: 2700,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 80,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 100,
    },
    maxTokens: 4000,
    temperature: 0.1,
  },

  envAliases: {
    apiKey: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    endpoint: ["ANTHROPIC_BASE_URL"],
  },

  stateDir: ".claude",

  docker: {
    variant: "claude",
    repositoryName: "viberator-worker",
    scriptImageName: "worker",
    supportedAgents: ["claude-code"],
    defaultForAgents: [],
    isAgentImage: false,
    dockerfilePath: "infra/workers/docker/viberator-docker-worker.Dockerfile",
  },
};

export default claudeCodePlugin;
