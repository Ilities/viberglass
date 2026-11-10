/** A model provider's refusal that a harness is waiting out before it tries again. */
export interface AcpProviderRetry {
  /** When the harness recorded it, in epoch milliseconds. */
  at: number;
  /** When the harness will try again, in epoch milliseconds. */
  retryAt: number;
  /** The provider's error, as the harness has it. */
  error: string;
  /** The HTTP status the provider answered with, when the harness kept it. */
  status?: number;
}

/**
 * Where a harness records that it's waiting out a provider's refusal. Some
 * send nothing over ACP while they wait, which for a usage limit's
 * Retry-After can be hours, so the worker reads their own records instead.
 */
export interface AcpProviderRetryReader {
  /** The latest refusal the harness recorded for the session, if any. */
  latest(sessionId: string): AcpProviderRetry | undefined;
}

/** Longer than a provider's overload or a short rate limit takes to pass; a usage limit's reset is hours away. */
export const LONGEST_PROVIDER_WAIT_MS = 5 * 60_000;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function duration(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const rest = totalMinutes % 60;
  if (hours === 0) return plural(rest, "minute");
  return rest === 0 ? plural(hours, "hour") : `${plural(hours, "hour")} ${plural(rest, "minute")}`;
}

/**
 * Why the turn should fail rather than wait, when the harness recorded the
 * refusal during this turn and means to wait longer than a run should.
 */
export function providerRetryFailure(retry: AcpProviderRetry, turnStartedAt: number, now: number): string | undefined {
  const wait = retry.retryAt - now;
  if (retry.at < turnStartedAt || wait <= LONGEST_PROVIDER_WAIT_MS) return undefined;
  const status = retry.status ? ` (HTTP ${retry.status})` : "";
  const error = retry.error.trim().replace(/\.+$/, "");
  return `The model provider refused the agent's request${status}: ${error}. The agent would wait ${duration(wait)} to try again, so the run stopped.`;
}
