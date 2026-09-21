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

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts usage from Claude Code's `--output-format=stream-json` output.
 *
 * The stream is NDJSON; the final `{"type":"result",…}` line carries the
 * session totals. Parsed line-by-line rather than with the inherited
 * `parseCliOutput`, whose greedy `{[\s\S]*}` match spans from the first
 * brace of the first event to the last brace of the last one and therefore
 * cannot parse a multi-line stream at all.
 *
 * Returns undefined when no result event is present — a crashed or truncated
 * run reports no usage rather than partial usage.
 */
export function parseClaudeCodeStreamJsonUsage(
  stdout: string,
): AgentUsageReport | undefined {
  let resultEvent: Record<string, unknown> | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    // Take the last result event: a resumed session can emit more than one,
    // and the final one holds the cumulative totals.
    if (isRecord(parsed) && parsed.type === "result") {
      resultEvent = parsed;
    }
  }

  if (!resultEvent) return undefined;

  const usage = isRecord(resultEvent.usage) ? resultEvent.usage : {};

  const report: AgentUsageReport = {
    inputTokens: asFiniteNumber(usage.input_tokens),
    outputTokens: asFiniteNumber(usage.output_tokens),
    cacheReadInputTokens: asFiniteNumber(usage.cache_read_input_tokens),
    cacheCreationInputTokens: asFiniteNumber(usage.cache_creation_input_tokens),
    costUsd: asFiniteNumber(resultEvent.total_cost_usd),
    turns: asFiniteNumber(resultEvent.num_turns),
    stopReason: asNonEmptyString(resultEvent.subtype),
    model: extractModel(resultEvent),
  };

  return hasAnyValue(report) ? report : undefined;
}

/**
 * `modelUsage` is keyed by model id. A single run can touch more than one
 * model (a small model for side tasks), so the one with the most output
 * tokens is reported as the run's model rather than whichever key happened to
 * come first.
 */
function extractModel(resultEvent: Record<string, unknown>): string | undefined {
  const direct = asNonEmptyString(resultEvent.model);
  if (direct) return direct;

  const modelUsage = resultEvent.modelUsage;
  if (!isRecord(modelUsage)) return undefined;

  let best: { model: string; outputTokens: number } | undefined;
  for (const [model, stats] of Object.entries(modelUsage)) {
    const outputTokens = isRecord(stats)
      ? (asFiniteNumber(stats.outputTokens) ?? asFiniteNumber(stats.output_tokens) ?? 0)
      : 0;
    if (!best || outputTokens > best.outputTokens) {
      best = { model, outputTokens };
    }
  }
  return best?.model;
}

function hasAnyValue(report: AgentUsageReport): boolean {
  return Object.values(report).some((value) => value !== undefined);
}
