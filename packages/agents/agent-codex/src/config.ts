import type { BaseAgentConfig } from "@viberglass/agent-core";

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
