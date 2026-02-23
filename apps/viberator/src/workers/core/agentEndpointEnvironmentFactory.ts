import type { AgentEndpointEnvironment } from "./agentEndpointEnvironment";

export interface AgentEndpointEnvironmentFactoryInput {
  requestedAgent?: string;
  clankerConfig?: Record<string, unknown>;
}

export interface AgentEndpointEnvironmentFactory {
  create(
    input: AgentEndpointEnvironmentFactoryInput,
  ): AgentEndpointEnvironment;
}
