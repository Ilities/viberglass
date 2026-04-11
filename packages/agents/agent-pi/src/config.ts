import type { BaseAgentConfig } from "@viberglass/agent-core";

// Pi coding agent configuration
// ACP bridge: https://github.com/svkozak/pi-acp (spawns pi --mode rpc)
export interface PiConfig extends BaseAgentConfig {
  name: "pi";
  apiKey: string; // ANTHROPIC_API_KEY; leave empty to rely on ambient env
}
