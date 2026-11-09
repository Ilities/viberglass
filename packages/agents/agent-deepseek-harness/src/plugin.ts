import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import { GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK } from "@viberglass/telemetry";
import type { DeepSeekHarnessConfig } from "./config";
import { DeepSeekHarnessAgent } from "./DeepSeekHarnessAgent";
import { DeepSeekHarnessModelEndpointEnvironment } from "./DeepSeekHarnessModelEndpointEnvironment";

const deepSeekHarnessPlugin: AgentPlugin<DeepSeekHarnessConfig> = {
  id: "deepseek-harness",
  label: "DeepSeek Harness",
  description: "DeepSeek's official coding agent, run through the community ACP adapter.",
  logo: "logo.svg",
  telemetryProvider: GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK,

  create(config, logger, gitService?: IAgentGitService) {
    return new DeepSeekHarnessAgent(config, logger, gitService);
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

  // dsh's DeepSeek route speaks the Anthropic Messages wire format.
  customEndpoints: {
    apiFormats: ["anthropic-messages"],
    environment: (endpoint) => new DeepSeekHarnessModelEndpointEnvironment(endpoint),
  },

  // dsh keeps profiles and credentials under ~/.dsh; dsh-acp keeps session logs separately.
  stateDirs: [".dsh", ".dsh-acp"],
  stateExcludes: [".dsh/.credentials.yaml"],

  settings: [
    {
      key: "model",
      label: "Model",
      type: "string",
      options: [
        { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
        { value: "deepseek-flash", label: "DeepSeek V4.1 Flash" },
      ],
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

export default deepSeekHarnessPlugin;
