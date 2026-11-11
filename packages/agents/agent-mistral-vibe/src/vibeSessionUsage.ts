import type { AcpSessionUsageReader, AcpUsageFields } from "@viberglass/agent-core";
import { isObjectRecord } from "@viberglass/types";

const count = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

/**
 * Vibe's prompt results report the session's tokens so far. Its `usage_update`s,
 * the one it sends when a saved session is loaded included, carry the same
 * totals in `_meta`: prompt tokens with cached ones in them, completion tokens
 * and cached tokens.
 */
export const vibeSessionUsage: AcpSessionUsageReader = {
  totalsOf(update): AcpUsageFields | null {
    if (update.sessionUpdate !== "usage_update" || !isObjectRecord(update._meta)) return null;
    const meta = update._meta;
    const inputTokens = count(meta.promptTokens);
    const outputTokens = count(meta.completionTokens);
    if (inputTokens === undefined || outputTokens === undefined) return null;
    return { inputTokens, outputTokens, cachedReadTokens: count(meta.cachedTokens) ?? 0 };
  },
};
