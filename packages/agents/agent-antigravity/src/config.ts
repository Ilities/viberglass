import type { BaseAgentConfig } from "@viberglass/agent-core";

// Google Antigravity, run through Google's ACP server (agy_acp_server)
export interface AntigravityConfig extends BaseAgentConfig {
  name: "antigravity";
  apiKey: string; // GEMINI_API_KEY
  model?: string; // Antigravity model id, e.g. "gemini-3.1-pro-high"
}
