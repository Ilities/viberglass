import type { BaseAgentConfig } from "@viberglass/agent-core";

// Qwen Code CLI configuration
// Docs: https://docs.qwen.ai/coder
export interface QwenCodeConfig extends BaseAgentConfig {
  name: "qwen-cli";
  apiKey: string; // OPENAI_API_KEY format (or sk-sp-xxxxx for Coding Plan)
  endpoint?:
    | "https://dashscope.aliyuncs.com/compatible-mode/v1" // Beijing
    | "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" // Singapore
    | "https://dashscope-us.aliyuncs.com/compatible-mode/v1" // Virginia
    | "https://coding.dashscope.aliyuncs.com/v1" // Coding Plan
    | string;
  model?: "qwen3-coder-plus" | "qwen-turbo" | "qwen-coder" | string;
  maxTokens?: number;
  temperature?: number;
  rateLimit?: {
    requestsPerMinute: number; // Default: 60 for OAuth
    requestsPerDay: number; // Default: 2000 for OAuth
  };
}
