import { ModelEndpointConfigEnvironment } from "@viberglass/agent-core";
import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import { GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK } from "@viberglass/telemetry";
import type { DeepseekHarnessConfig } from "./config";
import { DeepseekHarnessAgent } from "./DeepseekHarnessAgent";

const deepseekHarnessPlugin: AgentPlugin<DeepseekHarnessConfig> = {
  id: "deepseek-harness",
  label: "DeepSeek Harness",
  description: "DeepSeek's official coding agent with ACP support via dsh-acp.",
  logo: "logo.svg",
  telemetryProvider: GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK,

  create(config, logger, gitService?: IAgentGitService) {
    return new DeepseekHarnessAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: ["python", "javascript", "typescript", "java", "go", "rust", "cpp"],
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
    apiKey: ["DEEPSEEK_API_KEY"],
    endpoint: ["DEEPSEEK_BASE_URL"],
  },

  customEndpoints: {
    apiFormats: ["openai-chat"],
    environment: (endpoint) => new ModelEndpointConfigEnvironment(endpoint),
  },

  stateDirs: [".dsh", ".deepseek-harness"],
  stateExcludes: [".dsh/auth.json"],

  settings: [
    {
      key: "model",
      label: "Model",
      type: "string",
      options: ["deepseek-v4-pro", "deepseek-v4.1-flash"],
      allowCustom: true,
      providerDefault: "model",
      env: ["DSH_MODEL"],
    },
  ],

  providers: [{ provider: "deepseek", envVar: "DEEPSEEK_API_KEY", default: true, model: "deepseek-v4-pro" }],

  docker: {
    variant: "deepseek-harness",
    repositoryName: "viberator-worker-deepseek-harness",
    scriptImageName: "worker-deepseek-harness",
    supportedAgents: ["deepseek-harness"],
    defaultForAgents: ["deepseek-harness"],
  },
};

export default deepseekHarnessPlugin;
