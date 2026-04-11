import type { BaseAgentConfig } from "@viberglass/agent-core";

// Claude Code specific configuration
// Docs: https://code.claude.com/docs/en/cli-reference
export interface ClaudeCodeConfig extends BaseAgentConfig {
  name: "claude-code";
  apiKey: string; // ANTHROPIC_API_KEY
  endpoint?: string; // ANTHROPIC_BASE_URL for custom endpoints
  model?: "claude-sonnet-4-6" | "claude-opus-4-6" | string;
  maxTokens?: number;
  temperature?: number;
  appendSystemPrompt?: string; // Additional system instructions
  disableNonessentialTraffic?: boolean; // Disable telemetry
  bashDefaultTimeoutMs?: number; // Command timeout
}
