import { OpenCodeModelEndpointEnvironment } from "./OpenCodeModelEndpointEnvironment";
import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { OpenCodeConfig } from "./config";
import { OpenCodeAgent } from "./OpenCodeAgent";
import * as fs from "fs";
import * as path from "path";

const openCodePlugin: AgentPlugin<OpenCodeConfig> = {
  id: "opencode",
  label: "OpenCode",
  description: "OpenAI-compatible orchestration with customizable base URL and model.",
  logo: "logo.ico",

  create(config, logger, gitService?: IAgentGitService) {
    return new OpenCodeAgent(config, logger, gitService);
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
    costPerExecution: 0.7,
    averageSuccessRate: 0.82,
    executionTimeLimit: 3000,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 90,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 120,
    },
    temperature: 0.0,
  },

  envAliases: {
    apiKey: ["OPENCODE_API_KEY", "OPENAI_API_KEY"],
    endpoint: ["OPENCODE_BASE_URL", "OPENCODE_ENDPOINT", "OPENAI_BASE_URL"],
  },

  agentEnv: ["OPENCODE_CONFIG_DIR", "OPENCODE_CONFIG_CONTENT"],

  customEndpoints: { apiFormats: ["openai-chat"], environment: (endpoint) => new OpenCodeModelEndpointEnvironment(endpoint), rank: 0 },

  stateDirs: [".local/share/opencode"],
  stateExcludes: [".local/share/opencode/auth.json", ".local/share/opencode/log"],

  harnessConfigPatterns: ["opencode.json"],

  // The template names OPENAI_API_KEY because only model-provider variables reach the agent.
  harnessConfigEditor: {
    fileType: "opencode.json",
    label: "OpenCode Configuration",
    envReferences: ["{env:NAME}"],
    template: `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "my-proxy": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://llm-proxy.example.com/v1",
        "apiKey": "{env:OPENAI_API_KEY}"
      },
      "models": {
        "my-model": { "name": "My model" }
      }
    }
  }
}`,
  },

  materializeHarnessConfig: async ({ contents, homeDir }) => {
    const homeOpencodeDir = path.join(homeDir, ".opencode");
    const homeTargetPath = path.join(homeOpencodeDir, "opencode.json");
    await fs.promises.mkdir(homeOpencodeDir, { recursive: true });
    await fs.promises.writeFile(homeTargetPath, contents, "utf-8");
  },

  settings: [
    {
      key: "endpoint",
      label: "OpenCode Base URL",
      type: "string",
      description:
        "Optional OpenAI-compatible endpoint override. Usually not needed: OpenCode sends requests to the right endpoint for the model.",
      placeholder: "https://api.openai.com/v1",
      providerDefault: "endpoint",
      env: ["OPENCODE_BASE_URL", "OPENAI_BASE_URL"],
    },
    {
      key: "model",
      label: "OpenCode Model",
      type: "string",
      description: "Optional model override, as `provider/model` (e.g. `minimax/minimax-2.7`). `opencode models` lists them.",
      placeholder: "provider/model-name",
      providerDefault: "model",
      env: ["OPENCODE_MODEL"],
    },
  ],

  // OpenCode reads each provider's key from the env var models.dev names, and
  // needs a `<provider>/<model>` because it serves many providers.
  providers: [
    { provider: "opencode-go", envVar: "OPENCODE_API_KEY", default: true, model: "opencode-go/deepseek-v4.1-flash" },
    {
      provider: "openrouter",
      envVar: "OPENROUTER_API_KEY",
      default: true,
      model: "openrouter/anthropic/claude-sonnet-5",
    },
    { provider: "deepseek", envVar: "DEEPSEEK_API_KEY", default: true, model: "deepseek/deepseek-v4-pro" },
    { provider: "xai", envVar: "XAI_API_KEY", default: true, model: "xai/grok-4.7" },
    { provider: "groq", envVar: "GROQ_API_KEY", default: true, model: "groq/qwen/qwen3.8-27b" },
  ],

  docker: {
    variant: "opencode",
    repositoryName: "viberator-worker-opencode",
    scriptImageName: "worker-opencode",
    supportedAgents: ["opencode"],
    defaultForAgents: ["opencode"],
  },
};

export default openCodePlugin;
