import { ModelEndpointConfigEnvironment } from "@viberglass/agent-core";
import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { ClaudeCodeConfig } from "./config";
import { ClaudeCodeAgent } from "./ClaudeCodeAgent";

const claudeCodePlugin: AgentPlugin<ClaudeCodeConfig> = {
  id: "claude-code",
  label: "Claude Code",
  description: "General-purpose coding agent with strong code editing reliability.",
  logo: "logo.ico",
  telemetryProvider: "anthropic",

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

  customEndpoints: {
    apiFormats: ["anthropic-messages"],
    environment: (endpoint) => new ModelEndpointConfigEnvironment(endpoint),
  },

  envAliases: {
    apiKey: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    endpoint: ["ANTHROPIC_BASE_URL"],
  },

  agentEnv: [
    "ANTHROPIC_MODEL",
    "ANTHROPIC_CUSTOM_HEADERS",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
    "CLAUDE_CODE_NO_MODEL_FALLBACK",
    "CLAUDE_CODE_NON_INTERACTIVE",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
    "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
    "CLAUDE_CONFIG_DIR",
  ],

  stateDirs: [".claude"],
  stateExcludes: [".claude/.credentials.json"],
  skillDirs: [".claude/skills"],

  providers: [{ provider: "anthropic", envVar: "ANTHROPIC_API_KEY", default: true }],

  docker: {
    variant: "claude",
    repositoryName: "viberator-worker",
    scriptImageName: "worker",
    supportedAgents: ["claude-code"],
    defaultForAgents: [],
  },
};

export default claudeCodePlugin;
