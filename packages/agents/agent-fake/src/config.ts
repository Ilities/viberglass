import type { BaseAgentConfig } from "@viberglass/agent-core";

// Fake agent for end-to-end tests. Needs no API key or model.
export interface FakeConfig extends BaseAgentConfig {
  name: "fake";
}
