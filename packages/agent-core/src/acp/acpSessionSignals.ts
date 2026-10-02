/**
 * What a harness says about its session besides the conversation: how full its
 * context is (`usage_update`), and which slash commands it has
 * (`available_commands_update`), from which its compact command is found.
 */

export interface AcpContextUsage {
  /** Tokens in the harness's context now. */
  used: number;
  /** The context window, when the harness says. */
  size: number | null;
}

/** Compact commands in the order they're preferred; qwen calls its one `compress`. */
const COMPACT_COMMANDS = ["compact", "compress"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function updateOf(params: unknown): Record<string, unknown> | null {
  if (!isRecord(params)) return null;
  return isRecord(params.update) ? params.update : params;
}

const kindOf = (update: Record<string, unknown>) =>
  typeof update.sessionUpdate === "string" ? update.sessionUpdate : typeof update.type === "string" ? update.type : "";

const positive = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

export function contextUsageOf(params: unknown): AcpContextUsage | null {
  const update = updateOf(params);
  if (!update || kindOf(update) !== "usage_update") return null;
  const used = positive(update.used);
  return used === null ? null : { used, size: positive(update.size) };
}

/**
 * Per-turn usage some harnesses return with the prompt's result instead (the
 * Z.ai GLM agent): its input tokens are what the context held.
 */
export function promptUsageOf(result: unknown): AcpContextUsage | null {
  const usage = isRecord(result) && isRecord(result.usage) ? result.usage : null;
  if (!usage) return null;
  const used = positive(usage.inputTokens) ?? positive(usage.input_tokens) ?? positive(usage.totalTokens);
  return used === null ? null : { used, size: null };
}

/** The harness's compact command, as `/name`, when its command list has one. */
export function compactCommandOf(params: unknown): string | null | undefined {
  const update = updateOf(params);
  if (!update || kindOf(update) !== "available_commands_update") return undefined;
  const names = (Array.isArray(update.availableCommands) ? update.availableCommands : [])
    .map((command) => (isRecord(command) && typeof command.name === "string" ? command.name.replace(/^\//, "") : null))
    .filter((name): name is string => name !== null);
  const found = COMPACT_COMMANDS.find((name) => names.includes(name));
  return found ? `/${found}` : null;
}
