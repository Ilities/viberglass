import type { ExecutionResult } from "../../types";

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
}
