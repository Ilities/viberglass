import type { ExecutionResult } from "../../types";
import type {
  AgentAuthContext,
  AgentAuthLifecycle,
} from "../core/agentAuthLifecycle";

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
