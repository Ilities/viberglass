import type { BaseAgentConfig } from "@viberglass/agent-core";

// OpenCode configuration
// Docs: https://opencode.ai/docs
export interface OpenCodeConfig extends BaseAgentConfig {
  name: "opencode";
  apiKey: string; // Optional depending on provider, supports OPENCODE_API_KEY/OPENAI_API_KEY
  endpoint?: string; // Custom base URL for OpenAI-compatible providers
  model?: string;
  permissionMode?: "ask" | "auto" | "none" | string;
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access" | string;
}
