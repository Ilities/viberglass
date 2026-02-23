import type { Logger } from "winston";
import type { CallbackClient } from "../infrastructure/CallbackClient";
import type { CredentialProvider } from "../infrastructure/CredentialProvider";
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
  callbackClient: CallbackClient;
  workDir: string;
  sendProgress: AuthProgressReporter;
  credentialProvider?: CredentialProvider;
}

export interface AgentAuthLifecycleFactory {
  create(input: AgentAuthLifecycleFactoryInput): AgentAuthLifecycle;
}
