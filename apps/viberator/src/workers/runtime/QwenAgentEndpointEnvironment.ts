import type { AgentEndpointEnvironment } from "../core/agentEndpointEnvironment";

export class QwenAgentEndpointEnvironment implements AgentEndpointEnvironment {
  private readonly endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  resolve(): Record<string, string> {
    return {
      QWEN_CLI_ENDPOINT: this.endpoint,
      QWEN_API_ENDPOINT: this.endpoint,
    };
  }
}
