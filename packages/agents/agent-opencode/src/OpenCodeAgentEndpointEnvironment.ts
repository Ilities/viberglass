import type { AgentEndpointEnvironment } from "@viberglass/agent-core";

interface OpenCodeAgentEnvironmentOptions {
  endpoint?: string;
  model?: string;
}

export class OpenCodeAgentEndpointEnvironment
  implements AgentEndpointEnvironment
{
  private readonly endpoint?: string;
  private readonly model?: string;

  constructor(options: OpenCodeAgentEnvironmentOptions) {
    this.endpoint = options.endpoint;
    this.model = options.model;
  }

  resolve(): Record<string, string> {
    const resolved: Record<string, string> = {};

    if (this.endpoint) {
      resolved.OPENCODE_BASE_URL = this.endpoint;
      resolved.OPENAI_BASE_URL = this.endpoint;
    }

    if (this.model) {
      resolved.OPENCODE_MODEL = this.model;
    }

    return resolved;
  }
}
