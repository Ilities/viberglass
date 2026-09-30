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
 * Extracts usage from OpenCode's `run --format json` output.
 *
 * OpenCode emits one `step_finish` event per model call, each carrying that
 * step's tokens and cost, so the run's usage is their sum. The output names no
 * model; {@link parseOpenCodeSessionExport} reads it from the session.
 *
 * Returns undefined when no step finished.
 */
export function parseOpenCodeRunJsonUsage(
  stdout: string,
): AgentUsageReport | undefined {
  const steps = parseJsonLines(stdout).flatMap((event) =>
    event.type === "step_finish" && isRecord(event.part) ? [event.part] : [],
  );
  if (steps.length === 0) return undefined;

  const sum = (read: (step: Record<string, unknown>) => unknown): number | undefined => {
    const values = steps.map((step) => asFiniteNumber(read(step)));
    return values.some((value) => value !== undefined)
      ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
      : undefined;
  };
  const tokens = (step: Record<string, unknown>) =>
    isRecord(step.tokens) ? step.tokens : {};
  const cache = (step: Record<string, unknown>) => {
    const value = tokens(step).cache;
    return isRecord(value) ? value : {};
  };
  const costUsd = sum((step) => step.cost);

  return {
    inputTokens: sum((step) => tokens(step).input),
    outputTokens: sum((step) => tokens(step).output),
    reasoningOutputTokens: sum((step) => tokens(step).reasoning),
    cacheReadInputTokens: sum((step) => cache(step).read),
    cacheCreationInputTokens: sum((step) => cache(step).write),
    // OpenCode prices steps from its own model table and reports 0 for a
    // model it has no price for. A zero is therefore "unknown", not "free".
    costUsd: costUsd ? costUsd : undefined,
    turns: steps.length,
    stopReason: asNonEmptyString(steps[steps.length - 1].reason),
  };
}

/** The session an OpenCode `run --format json` belongs to; every event names it. */
export function findOpenCodeSessionId(stdout: string): string | undefined {
  for (const event of parseJsonLines(stdout)) {
    const sessionId = asNonEmptyString(event.sessionID);
    if (sessionId) return sessionId;
  }
  return undefined;
}

/**
 * Model and CLI version from `opencode export <sessionID>`, which the run
 * output itself does not carry. The model is `provider/model`, the form
 * OpenCode's `--model` takes.
 *
 * Both sit in the `info` block at the top of the export. A long session's
 * export can arrive cut short when piped, which breaks the JSON as a whole
 * but not that block, so it is read from the text when the whole won't parse.
 */
export function parseOpenCodeSessionExport(
  json: string,
): Pick<AgentUsageReport, "model" | "harnessVersion"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return readSessionInfoFromText(json);
  }
  const info = isRecord(parsed) && isRecord(parsed.info) ? parsed.info : {};
  const model = isRecord(info.model) ? info.model : {};

  return {
    model: formatOpenCodeModel(asNonEmptyString(model.providerID), asNonEmptyString(model.id)),
    harnessVersion: asNonEmptyString(info.version),
  };
}

function readSessionInfoFromText(text: string): Pick<AgentUsageReport, "model" | "harnessVersion"> {
  const infoBlock = text.split(/"messages"\s*:/)[0];
  const modelBlock = /"model"\s*:\s*\{([^{}]*)\}/.exec(infoBlock)?.[1] ?? "";
  const field = (source: string, name: string) =>
    new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`).exec(source)?.[1];

  return {
    model: formatOpenCodeModel(field(modelBlock, "providerID"), field(modelBlock, "id")),
    harnessVersion: field(infoBlock.replace(/"model"\s*:\s*\{[^{}]*\}/, ""), "version"),
  };
}

function formatOpenCodeModel(providerId: string | undefined, modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;
  return providerId ? `${providerId}/${modelId}` : modelId;
}

function parseJsonLines(stdout: string): Record<string, unknown>[] {
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
