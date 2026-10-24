import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { DeepseekHarnessConfig } from "./config";
import { DeepseekHarnessAgent } from "./DeepseekHarnessAgent";
import { DeepseekModelEndpointEnvironment } from "./DeepseekModelEndpointEnvironment";

const deepseekHarnessPlugin: AgentPlugin<DeepseekHarnessConfig> = {
  id: "deepseek-harness",
  label: "DeepSeek Harness",
  description: "DeepSeek's own coding agent, run on DeepSeek models with a DeepSeek API key.",
  logo: "logo.svg",
  telemetryProvider: "deepseek",

  create(config, logger, gitService?: IAgentGitService) {
    return new DeepseekHarnessAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: ["python", "javascript", "typescript", "java", "go", "rust", "cpp"],
    costPerExecution: 0.5,
    averageSuccessRate: 0.8,
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

  // The adapter reads DSH_PERMISSION_MODE from the environment; the allowlist admits it.
  agentEnv: ["DSH_PERMISSION_MODE"],

  // dsh keeps its home, sessions included, under ~/.dsh.
  stateDirs: [".dsh"],
  // The key comes from the environment each run, so a stored credential file is not archived.
  stateExcludes: [".dsh/.credentials.yaml"],

  customEndpoints: {
    apiFormats: ["openai-chat"],
    environment: (endpoint) => new DeepseekModelEndpointEnvironment(endpoint),
  },

  settings: [
    {
      key: "model",
      label: "DeepSeek Model",
      type: "select",
      description: "The DeepSeek model the harness runs on.",
      options: [
        { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
        { value: "deepseek-flash", label: "DeepSeek Flash" },
      ],
      allowCustom: true,
      placeholder: "deepseek-v4-pro",
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
