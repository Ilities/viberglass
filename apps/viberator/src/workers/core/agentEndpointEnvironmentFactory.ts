import type { Logger } from "winston";
import type { AgentEndpointEnvironment } from "@viberglass/agent-core";

export interface AgentEndpointEnvironmentFactoryInput {
  requestedAgent?: string;
  clankerConfig?: Record<string, unknown>;
  /** What the run sends in its model endpoint's session header: the agent session's id, else the job's. */
  session?: string;
  logger: Logger;
}

export interface AgentEndpointEnvironmentFactory {
  create(input: AgentEndpointEnvironmentFactoryInput): AgentEndpointEnvironment;
}
