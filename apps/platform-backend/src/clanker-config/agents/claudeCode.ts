import type { GenericAgentConfig } from "@viberglass/types";

export function normalizeClaudeCodeAgentConfig(): GenericAgentConfig {
  return {
    type: "claude-code",
  };
}
