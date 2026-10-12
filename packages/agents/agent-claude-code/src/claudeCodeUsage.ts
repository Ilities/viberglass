import { parseJsonLines, type AgentUsageReport } from "@viberglass/agent-core";

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
  // Take the last result event: a resumed session can emit more than one,
  // and the final one holds the cumulative totals.
  const resultEvent = parseJsonLines(stdout)
    .filter((event) => event.type === "result")
    .pop();

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
