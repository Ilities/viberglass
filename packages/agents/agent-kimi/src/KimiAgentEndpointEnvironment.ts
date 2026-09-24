import type { AgentEndpointEnvironment } from "@viberglass/agent-core";

interface KimiAgentEnvironmentOptions {
  endpoint?: string;
  model?: string;
}

/** Hands the runner's endpoint and model to KimiCodeAgent, which reads them from these env vars. */
export class KimiAgentEndpointEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly options: KimiAgentEnvironmentOptions) {}

  resolve(): Record<string, string> {
    const resolved: Record<string, string> = {};
    if (this.options.endpoint) {
      resolved.KIMI_BASE_URL = this.options.endpoint;
    }
    if (this.options.model) {
      resolved.KIMI_MODEL_NAME = this.options.model;
    }
    return resolved;
  }
}
