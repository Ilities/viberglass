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
