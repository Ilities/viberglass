import type { ExecutionResult } from "../../types";
import type {
  AgentAuthContext,
  AgentAuthLifecycle,
} from "../core/agentAuthLifecycle";

const CODEX_AUTH_FAILURE_PATTERNS: RegExp[] = [
  /unauthorized/i,
  /authentication failed/i,
  /authentication required/i,
  /login required/i,
  /not logged in/i,
  /invalid[_\s-]?token/i,
  /token[^.\n]*(expired|invalid)/i,
  /access token[^.\n]*(expired|invalid)/i,
  /\b401\b/i,
  /invalid_grant/i,
  /run\s+codex\s+login/i,
  /device authorization required/i,
  /session expired/i,
];

export function isCodexStoredAuthFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  const hasAuthSignal =
    normalized.includes("auth") ||
    normalized.includes("login") ||
    normalized.includes("token") ||
    normalized.includes("unauthorized") ||
    normalized.includes("401");

  if (!hasAuthSignal) {
    return false;
  }

  return CODEX_AUTH_FAILURE_PATTERNS.some((pattern) =>
    pattern.test(errorMessage),
  );
}

export interface CodexAgentAuthLifecycleDependencies {
  mode: string;
  materializeFromEnvironment(): Promise<void>;
  ensureDeviceAuth(jobId: string, tenantId: string): Promise<void>;
  forceFreshDeviceAuth(jobId: string, tenantId: string): Promise<void>;
}

export class CodexAgentAuthLifecycle implements AgentAuthLifecycle {
  constructor(private readonly dependencies: CodexAgentAuthLifecycleDependencies) {}

  async materializeFromEnvironment(): Promise<void> {
    await this.dependencies.materializeFromEnvironment();
  }

  async ensureReady(context: AgentAuthContext): Promise<void> {
    if (context.agentName !== "codex" || this.dependencies.mode === "api_key") {
      return;
    }

    await this.dependencies.ensureDeviceAuth(context.jobId, context.tenantId);
  }

  shouldRetryAfterFailure(
    context: AgentAuthContext,
    result: ExecutionResult,
  ): boolean {
    return (
      !result.success &&
      context.agentName === "codex" &&
      this.dependencies.mode === "chatgpt_device_stored" &&
      isCodexStoredAuthFailure(result.errorMessage || "")
    );
  }

  async refreshAfterFailure(context: AgentAuthContext): Promise<void> {
    if (context.agentName !== "codex") {
      return;
    }

    await this.dependencies.forceFreshDeviceAuth(
      context.jobId,
      context.tenantId,
    );
  }
}
