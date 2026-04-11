import type { AgentEndpointEnvironment } from "../agentEndpointEnvironment";

export class NoopAgentEndpointEnvironment implements AgentEndpointEnvironment {
  resolve(): Record<string, string> {
    return {};
  }
}
