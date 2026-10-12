import type { Logger } from "winston";
import type { AgentLoginUploader } from "@viberglass/agent-core";
import type { AgentAuthLifecycle } from "./agentAuthLifecycle";

export type AuthProgressReporter = (
  step: string,
  message: string,
  details?: Record<string, unknown>,
) => Promise<void>;

export interface AgentAuthLifecycleFactoryInput {
  requestedAgent?: string;
  clankerConfig?: Record<string, unknown>;
  logger: Logger;
  loginUploader: AgentLoginUploader;
  workDir: string;
  sendProgress: AuthProgressReporter;
}

export interface AgentAuthLifecycleFactory {
  create(input: AgentAuthLifecycleFactoryInput): AgentAuthLifecycle;
}
