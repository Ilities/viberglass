import type { BaseAgentConfig } from "@viberglass/agent-core";

// Google Gemini CLI configuration
// Docs: https://geminicli.com/docs/cli/cli-reference/
export interface GeminiConfig extends BaseAgentConfig {
  name: "gemini-cli";
  apiKey: string; // GEMINI_API_KEY (or GOOGLE_API_KEY for Vertex AI key mode)
  endpoint?: string; // Kept for backward compatibility; not passed as a CLI flag
  model?: string; // --model
  approvalMode?: "default" | "auto_edit" | "yolo"; // --approval-mode
}
