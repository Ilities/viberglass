import { DeepSeekModelEndpointEnvironment } from "./DeepSeekModelEndpointEnvironment";
import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { DeepSeekHarnessConfig } from "./config";
import { DeepSeekHarnessAgent } from "./DeepSeekHarnessAgent";

const deepSeekHarnessPlugin: AgentPlugin<DeepSeekHarnessConfig> = {
  id: "deepseek-harness",
  label: "DeepSeek Harness",
  description: "DeepSeek's own coding agent, run through its ACP adapter.",
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
    ],
    costPerExecution: 0.5,
    averageSuccessRate: 0.84,
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

  agentEnv: ["DSH_PERMISSION_MODE"],

  customEndpoints: {
    apiFormats: ["openai-chat"],
    environment: (endpoint) => new DeepSeekModelEndpointEnvironment(endpoint),
  },

  // dsh keeps everything under one home at ~/.dsh, and dsh-acp persists sessions there.
  stateDirs: [".dsh"],
  // The adapter's credential store; the run's own key is handed over fresh each time.
  stateExcludes: [".dsh/.credentials.yaml"],

  settings: [
    {
      key: "model",
      label: "DeepSeek Harness Model",
      type: "select",
      description: "The model the harness runs.",
      options: [
        { value: "deepseek-v4-pro", label: "deepseek-v4-pro" },
        { value: "deepseek-v4.1-flash", label: "deepseek-v4.1-flash" },
      ],
      allowCustom: true,
      providerDefault: "model",
      env: ["DSH_MODEL"],
    },
  ],

  // DeepSeek Harness is the harness DeepSeek keys get by default; OpenCode keeps the binding for its own runners.
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
