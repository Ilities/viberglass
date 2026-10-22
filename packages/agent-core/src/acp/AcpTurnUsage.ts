import type { AgentUsageReport } from "../usage";
import type { AcpSessionTotals } from "./AcpSessionTotalsProbe";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const count = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

const add = (total: number | undefined, more: number | undefined): number | undefined =>
  more === undefined ? total : (total ?? 0) + more;

type TurnTokens = Omit<AgentUsageReport, "costUsd" | "model" | "harnessVersion" | "stopReason" | "turns">;

/** ACP's usage fields, added to what was counted so far. */
function addUsage(tokens: TurnTokens, usage: Record<string, unknown>): TurnTokens {
  return {
    inputTokens: add(tokens.inputTokens, count(usage.inputTokens)),
    outputTokens: add(tokens.outputTokens, count(usage.outputTokens)),
    reasoningOutputTokens: add(tokens.reasoningOutputTokens, count(usage.thoughtTokens)),
    cacheReadInputTokens: add(tokens.cacheReadInputTokens, count(usage.cachedReadTokens)),
    cacheCreationInputTokens: add(tokens.cacheCreationInputTokens, count(usage.cachedWriteTokens)),
  };
}

/**
 * What one turn used, from what the harness says over ACP: the tokens each
 * prompt's result reports, or else each model call's, and the cost its
 * `usage_update`s carry. That cost
 * is the whole session's so far, so the turn's is what it grew by; when the
 * session was continued and no earlier cost was seen, the turn's can't be
 * told and is left out rather than guessed.
 */
export class AcpTurnUsage {
  private tokens: TurnTokens = {};
  private reported = false;
  private messageTokens: TurnTokens = {};
  private messagesReported = false;
  private harnessVersion?: string;
  private sessionCost?: number;
  private costAtStart?: number;
  private totalsCost?: number;

  /** The harness's version, from `initialize`'s `agentInfo`. */
  noteInitialized(result: unknown): void {
    const info = isRecord(result) && isRecord(result.agentInfo) ? result.agentInfo : null;
    if (info && typeof info.version === "string" && info.version) this.harnessVersion = info.version;
  }

  /** A `usage_update`, including one replayed while a session loads: its cost is the session's so far. */
  noteSessionUpdate(params: unknown): void {
    const update = isRecord(params) && isRecord(params.update) ? params.update : params;
    if (!isRecord(update) || update.sessionUpdate !== "usage_update") return;
    const amount = isRecord(update.cost) ? count(update.cost.amount) : undefined;
    if (amount !== undefined) this.sessionCost = amount;
  }

  /** Called before the turn's first prompt: a fresh session has cost nothing yet. */
  startTurn(freshSession: boolean): void {
    this.costAtStart = freshSession ? 0 : this.sessionCost;
  }

  /** A prompt's result: ACP's `usage`, which a harness may leave out. */
  notePromptResult(result: unknown): void {
    const usage = isRecord(result) && isRecord(result.usage) ? result.usage : null;
    if (!usage) return;
    this.reported = true;
    this.tokens = addUsage(this.tokens, usage);
  }

  /**
   * One model call's usage, which a harness may put in an update's `_meta`
   * instead of the prompt's result (Qwen Code). Not for replayed updates.
   */
  noteMessageUsage(params: unknown): void {
    const update = isRecord(params) && isRecord(params.update) ? params.update : params;
    const usage = isRecord(update) && isRecord(update._meta) && isRecord(update._meta.usage) ? update._meta.usage : null;
    if (!usage) return;
    this.messagesReported = true;
    this.messageTokens = addUsage(this.messageTokens, usage);
  }

  /**
   * The session's totals before and after the turn, for a harness that only
   * reports totals: the turn used what they grew by. What the prompts reported
   * themselves comes first.
   */
  noteTotals(before: AcpSessionTotals | null, after: AcpSessionTotals | null): void {
    if (!before || !after) return;
    const grew = (key: keyof AcpSessionTotals) =>
      after[key] !== undefined && before[key] !== undefined ? Math.max(0, (after[key] ?? 0) - (before[key] ?? 0)) : undefined;
    if (!this.reported && !this.messagesReported) {
      this.reported = true;
      this.tokens = {
        inputTokens: grew("inputTokens"),
        outputTokens: grew("outputTokens"),
        cacheReadInputTokens: grew("cacheReadInputTokens"),
        cacheCreationInputTokens: grew("cacheCreationInputTokens"),
      };
    }
    if (this.totalsCost === undefined) this.totalsCost = grew("costUsd");
  }

  /** The turn's usage, or undefined when the harness reported none. */
  report(): AgentUsageReport | undefined {
    const tokens = this.reported ? this.tokens : this.messageTokens;
    const costUsd =
      this.sessionCost !== undefined && this.costAtStart !== undefined ? Math.max(0, this.sessionCost - this.costAtStart) : this.totalsCost;
    if (!this.reported && !this.messagesReported && costUsd === undefined) return undefined;
    return { ...tokens, ...(costUsd !== undefined ? { costUsd } : {}), ...(this.harnessVersion ? { harnessVersion: this.harnessVersion } : {}) };
  }
}
