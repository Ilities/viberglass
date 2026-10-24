import { DeepSeekHarnessModelEndpointEnvironment } from "./DeepSeekHarnessModelEndpointEnvironment";
import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { DeepSeekHarnessConfig } from "./config";
import { DeepSeekHarnessAgent } from "./DeepSeekHarnessAgent";

const deepSeekHarnessPlugin: AgentPlugin<DeepSeekHarnessConfig> = {
  id: "deepseek-harness",
  label: "DeepSeek Harness",
  description: "DeepSeek's own coding agent, running DeepSeek models.",
  logo: "logo.svg",
  telemetryProvider: "deepseek",

  create(config, logger, gitService?: IAgentGitService) {
    return new DeepSeekHarnessAgent(config, logger, gitService);
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

  // DSH_PERMISSION_MODE is set by the agent; the rest come through envAliases and settings.
  agentEnv: ["DSH_PERMISSION_MODE"],

  customEndpoints: {
    apiFormats: ["openai-chat"],
    environment: (endpoint) => new DeepSeekHarnessModelEndpointEnvironment(endpoint),
  },

  // Sessions, settings and presets all live under the one harness home.
  stateDirs: [".dsh"],
  stateExcludes: [".dsh/.credentials.yaml"],

  settings: [
    {
      key: "model",
      label: "Model",
      type: "select",
      description: "The DeepSeek model to run.",
      options: [
        { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
        { value: "deepseek-flash", label: "DeepSeek V4.1 Flash" },
      ],
      allowCustom: true,
      providerDefault: "model",
      env: ["DSH_MODEL"],
    },
  ],

  providers: [
    { provider: "deepseek", envVar: "DEEPSEEK_API_KEY", default: true, model: "deepseek-v4-pro" },
  ],

  docker: {
    variant: "deepseek-harness",
    repositoryName: "viberator-worker-deepseek-harness",
    scriptImageName: "worker-deepseek-harness",
    supportedAgents: ["deepseek-harness"],
    defaultForAgents: ["deepseek-harness"],
  },
};

export default deepSeekHarnessPlugin;
