import type { BaseAgentConfig } from "@viberglass/agent-core";

// DeepSeek Harness (dsh) configuration
// ACP bridge: https://github.com/openma-ai/deepseek-harness-acp (standalone dsh-acp)
export interface DeepSeekHarnessConfig extends BaseAgentConfig {
  name: "deepseek-harness";
  model?: string; // DSH_MODEL
}
