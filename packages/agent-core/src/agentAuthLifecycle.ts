import { gunzipSync } from "node:zlib";
import { STORED_LOGIN_GZIP_PREFIX } from "@viberglass/types";
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

/** Uploads a login the harness got or refreshed, so the runner starts its next run signed in. */
export interface AgentLoginUploader {
  sendAgentLogin(jobId: string, tenantId: string, credential: string): Promise<void>;
}

/** A stored login as the harness wrote it, undoing the gzip a store's size limit may have needed. */
export function decodeStoredLogin(storedValue: string): string {
  const trimmed = storedValue.trim();
  if (!trimmed.startsWith(STORED_LOGIN_GZIP_PREFIX)) return trimmed;
  return gunzipSync(Buffer.from(trimmed.slice(STORED_LOGIN_GZIP_PREFIX.length), "base64")).toString("utf-8");
}
