import { GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK } from "@viberglass/telemetry";
import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import { DeepseekModelEndpointEnvironment } from "./DeepseekModelEndpointEnvironment";
import type { DeepseekHarnessConfig } from "./config";
import { DeepseekHarnessAgent } from "./DeepseekHarnessAgent";

const deepseekHarnessPlugin: AgentPlugin<DeepseekHarnessConfig> = {
  id: "deepseek-harness",
  label: "DeepSeek Harness",
  description: "DeepSeek's coding agent, with persistent sessions and native tool use.",
  logo: "logo.svg",
  telemetryProvider: GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK,

  create(config, logger, gitService?: IAgentGitService) {
    return new DeepseekHarnessAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: ["python", "javascript", "typescript", "java", "go", "rust", "cpp"],
    costPerExecution: 0.5,
    averageSuccessRate: 0.82,
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

  agentEnv: ["DSH_HOME", "DSH_SESSION_ROOT", "DSH_PERMISSION_MODE", "DSH_MODEL"],

  stateDirs: [".dsh-acp/sessions"],

  settings: [
    {
      key: "model",
      label: "DeepSeek Harness Model",
      type: "string",
      description: "DeepSeek model ID. Choose a listed model or enter another supported ID.",
      options: [
        { label: "DeepSeek V4 Pro", value: "deepseek-v4-pro" },
        { label: "DeepSeek V4.1 Flash", value: "deepseek-v4.1-flash" },
      ],
      allowCustom: true,
      providerDefault: "model",
      env: ["DSH_MODEL"],
    },
  ],

  customEndpoints: {
    apiFormats: ["openai-chat"],
    environment: (endpoint) => new DeepseekModelEndpointEnvironment(endpoint),
  },

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
