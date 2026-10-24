import type { BaseAgentConfig } from "@viberglass/agent-core";

export interface DeepSeekHarnessConfig extends BaseAgentConfig {
  name: "deepseek-harness";
  model?: string; // DSH_MODEL
}
