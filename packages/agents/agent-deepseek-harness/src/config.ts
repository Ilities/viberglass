import type { BaseAgentConfig } from "@viberglass/agent-core";

export interface DeepseekHarnessConfig extends BaseAgentConfig {
  name: "deepseek-harness";
  model?: string;
  endpoint?: string;
}
