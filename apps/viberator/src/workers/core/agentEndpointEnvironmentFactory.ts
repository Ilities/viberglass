import type { Logger } from "winston";
import type { AgentEndpointEnvironment } from "@viberglass/agent-core";

export interface AgentEndpointEnvironmentFactoryInput {
  requestedAgent?: string;
  clankerConfig?: Record<string, unknown>;
  logger: Logger;
}

export interface AgentEndpointEnvironmentFactory {
  create(input: AgentEndpointEnvironmentFactoryInput): AgentEndpointEnvironment;
}
