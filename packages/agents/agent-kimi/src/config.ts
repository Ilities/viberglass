import type { BaseAgentConfig } from "@viberglass/agent-core";

// Kimi Code configuration
// Docs: https://moonshotai.github.io/kimi-cli/en/configuration/config-files.html
export interface KimiCodeConfig extends BaseAgentConfig {
  name: "kimi-code";
  apiKey: string; // KIMI_API_KEY or MOONSHOT_API_KEY
  endpoint?: string; // KIMI_BASE_URL / MOONSHOT_BASE_URL
  model?: "kimi-k2" | "kimi-k2-turbo-preview" | string;
  temperature?: number;
}
