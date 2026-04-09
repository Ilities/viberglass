import type { Configuration } from "../types";

/**
 * Default agent configurations.
 * These are baseline configurations that can be overridden by environment variables or SSM parameters.
 */
export const DEFAULT_AGENT_CONFIGS: Configuration["agents"] = {
  "claude-code": {
    apiKey: "",
    name: "claude-code",
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
    executionTimeLimit: 2700, // 45 minutes
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 80,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 100,
    },
    maxTokens: 4000,
    temperature: 0.1,
  },
  "qwen-cli": {
    name: "qwen-cli",
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
  codex: {
    name: "codex",
    apiKey: "",
    capabilities: [
      "python",
      "javascript",
      "typescript",
      "java",
      "go",
      "cpp",
      "csharp",
    ],
    costPerExecution: 0.75,
    averageSuccessRate: 0.82,
    executionTimeLimit: 3000,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 90,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 120,
    },
    maxTokens: 8000,
    temperature: 0.0,
  },
  opencode: {
    name: "opencode",
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
  "kimi-code": {
    name: "kimi-code",
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
    model: "kimi-k2",
    temperature: 0.0,
  },
  "mistral-vibe": {
    name: "mistral-vibe",
    apiKey: "",
    capabilities: ["python", "javascript", "typescript", "rust", "go"],
    costPerExecution: 0.4,
    averageSuccessRate: 0.8,
    executionTimeLimit: 2400,
    resourceLimits: {
      maxMemoryMB: 1792,
      maxCpuPercent: 75,
      maxDiskSpaceMB: 768,
      maxNetworkRequests: 90,
    },
    maxTokens: 4000,
    temperature: 0.1,
  },
  "gemini-cli": {
    name: "gemini-cli",
    apiKey: "",
    capabilities: [
      "python",
      "javascript",
      "typescript",
      "java",
      "kotlin",
      "swift",
    ],
    costPerExecution: 0.35,
    averageSuccessRate: 0.77,
    executionTimeLimit: 2100,
    resourceLimits: {
      maxMemoryMB: 1536,
      maxCpuPercent: 70,
      maxDiskSpaceMB: 512,
      maxNetworkRequests: 85,
    },
    approvalMode: "yolo",
  },
  pi: {
    name: "pi",
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
};

/**
 * Environment variable aliases for agent configuration.
 * Maps agent names to their official environment variable names for API keys and endpoints.
 */
export const AGENT_ENV_ALIASES: Record<
  string,
  { apiKey?: string[]; endpoint?: string[] }
> = {
  "claude-code": {
    apiKey: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    endpoint: ["ANTHROPIC_BASE_URL"],
  },
  "qwen-cli": {
    apiKey: ["QWEN_CLI_API_KEY"],
    endpoint: ["QWEN_API_ENDPOINT", "OPENAI_BASE_URL"],
  },
  "kimi-code": {
    apiKey: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
    endpoint: ["KIMI_BASE_URL", "KIMI_CODE_ENDPOINT", "MOONSHOT_BASE_URL"],
  },
  codex: {
    apiKey: ["OPENAI_API_KEY"],
    endpoint: ["CODEX_ENDPOINT", "OPENAI_BASE_URL"],
  },
  opencode: {
    apiKey: ["OPENCODE_API_KEY", "OPENAI_API_KEY"],
    endpoint: ["OPENCODE_BASE_URL", "OPENCODE_ENDPOINT", "OPENAI_BASE_URL"],
  },
  "gemini-cli": {
    apiKey: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  },
  "mistral-vibe": {
    apiKey: ["MISTRAL_API_KEY"],
  },
  pi: {
    apiKey: ["ANTHROPIC_API_KEY"],
  },
};
