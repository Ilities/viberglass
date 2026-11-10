/**
 * Token usage and cost reported by an agent CLI.
 *
 * Per-job cost is currently a hardcoded constant per plugin and is not persisted
 * at all. The fix is to "parse usage from the CLIs that expose it.
 *
 * Every field is optional, and the *absence* of a
 * report is meaningful and recorded rather than being backfilled from the
 * plugin's `costPerExecution` constant and then indistinguishable from a
 * measurement. An agent that cannot report usage returns nothing here, and the
 * span carries `vg.usage.available=false`.
 */
export interface AgentUsageReport {
  /** Input the model read fresh, without cache reads and writes, which are counted below. */
  inputTokens?: number;
  outputTokens?: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  /** Cost the CLI itself reported. Never a local estimate. */
  costUsd?: number;
  /** Model the CLI reported using, when it says. */
  model?: string;
  /** Version of the agent CLI, when it says. */
  harnessVersion?: string;
  /** Why the CLI stopped, in its own vocabulary. */
  stopReason?: string;
  /** Number of agent turns, when the CLI reports it. */
  turns?: number;
}

/** The usage with cache reads and writes taken out of its input, for a harness whose input count includes them. */
export function withUncachedInput(usage: AgentUsageReport): AgentUsageReport {
  if (usage.inputTokens === undefined) return usage;
  const cached = (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0);
  return { ...usage, inputTokens: Math.max(0, usage.inputTokens - cached) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The JSON objects in NDJSON output, one per line; anything else is skipped. */
export function parseJsonLines(stdout: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed)) events.push(parsed);
    } catch {
      continue;
    }
  }
  return events;
}
