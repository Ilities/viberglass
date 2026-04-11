import type { AgentAuthContext, AgentAuthLifecycle } from "../agentAuthLifecycle";
import type { ExecutionResult } from "../types";

export class NoopAgentAuthLifecycle implements AgentAuthLifecycle {
  async materializeFromEnvironment(): Promise<void> {}

  async ensureReady(_context: AgentAuthContext): Promise<void> {}

  shouldRetryAfterFailure(
    _context: AgentAuthContext,
    _result: ExecutionResult,
  ): boolean {
    return false;
  }

  async refreshAfterFailure(_context: AgentAuthContext): Promise<void> {}
}
