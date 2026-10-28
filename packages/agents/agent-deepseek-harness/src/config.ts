import type { BaseAgentConfig } from "@viberglass/agent-core";

// DeepSeek Harness (`dsh`), run through the community ACP adapter `dsh-acp`.
export interface DeepSeekHarnessConfig extends BaseAgentConfig {
  name: "deepseek-harness";
  apiKey: string; // DEEPSEEK_API_KEY
  model?: string; // DSH_MODEL
}
