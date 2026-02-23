import type { AgentEndpointEnvironment } from "../core/agentEndpointEnvironment";

export class NoopAgentEndpointEnvironment implements AgentEndpointEnvironment {
  resolve(): Record<string, string> {
    return {};
  }
}
