export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskSpaceMB: number;
  maxNetworkRequests: number;
}

// Base configuration shared by all agents
export interface BaseAgentConfig extends Record<string, unknown> {
  capabilities: string[]; // ['python', 'javascript', 'java', 'typescript', 'go', 'rust']
  costPerExecution: number;
  averageSuccessRate: number;
  executionTimeLimit: number; // seconds
  resourceLimits: ResourceLimits;
}

// Claude Code specific configuration
// Docs: https://code.claude.com/docs/en/cli-reference
export interface ClaudeCodeConfig extends BaseAgentConfig {
  name: "claude-code";
  apiKey: string; // ANTHROPIC_API_KEY
  endpoint?: string; // ANTHROPIC_BASE_URL for custom endpoints
  model?: "claude-sonnet-4-5" | "claude-opus-4-5" | string;
  maxTokens?: number;
  temperature?: number;
  appendSystemPrompt?: string; // Additional system instructions
  disableNonessentialTraffic?: boolean; // Disable telemetry
  bashDefaultTimeoutMs?: number; // Command timeout
}

// Qwen Code configuration (DashScope API or CLI)
// Docs: https://www.alibabacloud.com/help/en/model-studio/qwen-api-reference/
export interface QwenCodeConfig extends BaseAgentConfig {
  name: "qwen-cli" | "qwen-api";
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

// OpenAI Codex configuration
// Docs: https://developers.openai.com/codex/config-reference/
export interface CodexConfig extends BaseAgentConfig {
  name: "codex";
  apiKey: string; // OpenAI API key
  endpoint?: string; // Custom base URL for proxy/self-hosted
  model?:
    | "gpt-5-codex"
    | "gpt-5.2-codex"
    | "o1"
    | "o1-preview"
    | "o1-mini"
    | string;
  maxTokens?: number;
  temperature?: number;
  modelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  modelReasoningSummary?: "auto" | "concise" | "detailed" | "none";
  modelVerbosity?: "low" | "medium" | "high";
  approvalPolicy?: "untrusted" | "on-failure" | "on-request" | "never";
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  provider?: "openai" | "proxy" | "ollama" | "mistral" | string;
  mcpServers?: Record<string, unknown>; // MCP server configuration
}

// Google Gemini configuration
// Docs: https://ai.google.dev/gemini-api/docs/quickstart
export interface GeminiConfig extends BaseAgentConfig {
  name: "gemini-cli";
  apiKey: string; // Google AI API key
  endpoint?: string; // Custom endpoint if needed
  model?: "gemini-pro" | "gemini-1.5-pro" | "gemini-2.0-flash" | string;
  maxOutputTokens?: number; // Gemini uses maxOutputTokens instead of maxTokens
  temperature?: number;
  topP?: number;
  topK?: number;
  codeExecutionEnabled?: boolean; // Enable Python code execution
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

// Mistral Vibe configuration
// Docs: https://docs.mistral.ai/api and https://github.com/mistralai/mistral-vibe
export interface MistralVibeConfig extends BaseAgentConfig {
  name: "mistral-vibe";
  apiKey: string; // MISTRAL_API_KEY
  endpoint?: "https://api.mistral.ai" | "https://codestral.mistral.ai" | string;
  model?:
    | "devstral-2" // 123B parameters, free
    | "devstral-small-2" // 24B parameters
    | "codestral-25.01" // 22B, 86.6% HumanEval
    | "mistral-medium-latest"
    | "mistral-small-latest"
    | string;
  maxTokens?: number;
  temperature?: number; // 0.0-2.0
  topP?: number; // 0.0-1.0
  safePrompt?: boolean; // Content filtering
  randomSeed?: number; // For deterministic outputs
  frequencyPenalty?: number; // Reduce repetition
  presencePenalty?: number; // Encourage diversity
  stopTokens?: string[]; // e.g., ['```'] to end at code blocks
  autoApprove?: boolean; // Auto-approve tool execution in CLI
}

// Union type for all agent configurations
export type AgentConfig =
  | ClaudeCodeConfig
  | QwenCodeConfig
  | CodexConfig
  | GeminiConfig
  | MistralVibeConfig;
