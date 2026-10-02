import type { ExecutionResult } from "./types";

export interface AgentAuthContext {
  agentName: string;
  jobId: string;
  tenantId: string;
}

export interface AgentAuthLifecycle {
  materializeFromEnvironment(): Promise<void>;
  ensureReady(context: AgentAuthContext): Promise<void>;
  shouldRetryAfterFailure(
    context: AgentAuthContext,
    result: ExecutionResult,
  ): boolean;
  refreshAfterFailure(context: AgentAuthContext): Promise<void>;
  /**
   * Signs the agent in from scratch, for a login-only job. An agent without an
   * interactive login has nothing to do.
   */
  login(context: AgentAuthContext): Promise<void>;
  /** Saves credentials the agent refreshed during the run, so the next run starts signed in. */
  persistAfterRun(context: AgentAuthContext): Promise<void>;
}
