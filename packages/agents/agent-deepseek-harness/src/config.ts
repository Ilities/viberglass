import type { BaseAgentConfig } from "@viberglass/agent-core";

// DeepSeek Harness (dsh) configuration
// ACP bridge: https://github.com/openma-ai/deepseek-harness-acp (composes dsh in-process)
export interface DeepSeekHarnessConfig extends BaseAgentConfig {
  name: "deepseek-harness";
  apiKey: string; // DEEPSEEK_API_KEY; leave empty to rely on ambient env
}
