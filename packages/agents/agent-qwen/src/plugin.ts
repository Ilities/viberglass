import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import { ModelEndpointConfigEnvironment } from "@viberglass/agent-core";
import type { QwenCodeConfig } from "./config";
import { QwenCodeAgent } from "./QwenCodeAgent";

const qwenCodePlugin: AgentPlugin<QwenCodeConfig> = {
  id: "qwen-cli",
  label: "Qwen CLI",
  description: "Fast tool execution with endpoint flexibility for Qwen-compatible APIs.",
  logo: "logo.ico",
  telemetryProvider: "alibaba.qwen",

  create(config, logger, gitService?: IAgentGitService) {
    return new QwenCodeAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: ["python", "javascript", "typescript", "java", "cpp"],
    costPerExecution: 0.3,
    averageSuccessRate: 0.78,
    executionTimeLimit: 2400,
    resourceLimits: {
      maxMemoryMB: 1536,
      maxCpuPercent: 70,
      maxDiskSpaceMB: 512,
      maxNetworkRequests: 80,
    },
    maxTokens: 3000,
    temperature: 0.2,
  },

  envAliases: {
    apiKey: ["QWEN_CLI_API_KEY"],
    endpoint: ["QWEN_API_ENDPOINT", "OPENAI_BASE_URL"],
  },

  agentEnv: [
    "OPENAI_MODEL",
    "DASHSCOPE_API_KEY",
    "QWEN_CODE_SYSTEM_SETTINGS_PATH",
    "QWEN_PLACEHOLDER_API_KEY",
  ],

  stateDirs: [".qwen"],
  stateExcludes: [".qwen/oauth_creds.json"],

  customEndpoints: {
    apiFormats: ["openai-chat", "openai-responses", "anthropic-messages"],
    environment: (endpoint) => new ModelEndpointConfigEnvironment(endpoint),
  },

  settings: [
    {
      key: "endpoint",
      label: "Qwen API Endpoint",
      type: "select",
      description: "The endpoint region for this agent.",
      options: [
        { value: "https://dashscope.aliyuncs.com/compatible-mode/v1", label: "Mainland China" },
        { value: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", label: "International (Singapore)" },
        { value: "https://dashscope-us.aliyuncs.com/compatible-mode/v1", label: "US (Virginia)" },
        { value: "https://coding.dashscope.aliyuncs.com/v1", label: "Coding Plan" },
        { value: "https://coding-intl.dashscope.aliyuncs.com/v1", label: "Coding Plan International" },
      ],
      allowCustom: true,
      placeholder: "https://your-endpoint.example.com/compatible-mode/v1",
      providerDefault: "endpoint",
      env: ["QWEN_CLI_ENDPOINT", "QWEN_API_ENDPOINT"],
    },
  ],

  providers: [
    {
      provider: "alibaba",
      envVar: "QWEN_CLI_API_KEY",
      default: true,
      endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    },
    {
      provider: "alibaba-coding-plan",
      envVar: "QWEN_CLI_API_KEY",
      default: true,
      endpoint: "https://coding-intl.dashscope.aliyuncs.com/v1",
    },
  ],

  docker: {
    variant: "qwen",
    repositoryName: "viberator-worker-qwen",
    scriptImageName: "worker-qwen",
    supportedAgents: ["qwen-cli"],
    defaultForAgents: ["qwen-cli"],
  },
};

export default qwenCodePlugin;
