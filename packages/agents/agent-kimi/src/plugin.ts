import { ModelEndpointConfigEnvironment, type AgentPlugin, type IAgentGitService } from "@viberglass/agent-core";
import type { KimiCodeConfig } from "./config";
import { KimiCodeAgent } from "./KimiCodeAgent";

const kimiCodePlugin: AgentPlugin<KimiCodeConfig> = {
  id: "kimi-code",
  label: "Kimi Code",
  description: "Moonshot/Kimi based coding agent tuned for high-context completion.",
  logo: "logo.ico",
  telemetryProvider: "moonshot",

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
    // No model here: KimiCodeAgent defaults to Kimi Code's model, and a runner can set one.
    temperature: 0.0,
  },

  envAliases: {
    apiKey: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
    endpoint: ["KIMI_BASE_URL", "KIMI_CODE_ENDPOINT", "MOONSHOT_BASE_URL"],
  },

  agentEnv: ["KIMI_CODE_NO_AUTO_UPDATE"],

  // Kimi Code CLI keeps everything, its own binary included, in ~/.kimi-code. Resume across
  // containers isn't verified yet: it needs a Kimi key to try.
  stateDirs: [".kimi-code"],
  // A run on a model endpoint writes config.toml, its key included; the next run writes its own.
  stateExcludes: [".kimi-code/bin", ".kimi-code/credentials", ".kimi-code/logs", ".kimi-code/config.toml"],

  customEndpoints: {
    apiFormats: ["openai-chat", "openai-responses", "anthropic-messages"],
    environment: (endpoint) => new ModelEndpointConfigEnvironment(endpoint),
  },

  settings: [
    {
      key: "endpoint",
      label: "Kimi Endpoint",
      type: "string",
      description: "Leave empty for Kimi Code. A Moonshot platform key needs Moonshot's API, e.g. `https://api.moonshot.ai/v1`.",
      placeholder: "https://api.moonshot.ai/v1",
      providerDefault: "endpoint",
      env: ["KIMI_BASE_URL"],
    },
    {
      key: "model",
      label: "Kimi Model",
      type: "string",
      description: "Optional model id. Leave empty for Kimi Code's default.",
      placeholder: "kimi-k3",
      providerDefault: "model",
      env: ["KIMI_MODEL_NAME"],
    },
  ],

  providers: [
    { provider: "kimi-code", envVar: "KIMI_API_KEY", default: true },
    {
      provider: "moonshotai",
      envVar: "MOONSHOT_API_KEY",
      default: true,
      endpoint: "https://api.moonshot.ai/v1",
      model: "kimi-k3",
    },
  ],

  docker: {
    variant: "kimi",
    repositoryName: "viberator-worker-kimi",
    scriptImageName: "worker-kimi",
    supportedAgents: ["kimi-code"],
    defaultForAgents: ["kimi-code"],
  },
};

export default kimiCodePlugin;
