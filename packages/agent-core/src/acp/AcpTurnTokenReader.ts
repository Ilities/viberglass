import type { AgentUsageReport } from "../usage";

export type AcpTurnTokens = Pick<
  AgentUsageReport,
  "inputTokens" | "outputTokens" | "reasoningOutputTokens" | "cacheReadInputTokens" | "cacheCreationInputTokens"
>;

/** A turn's tokens, and its cost when the harness recorded one. */
export type AcpRecordedUsage = AcpTurnTokens & Pick<AgentUsageReport, "costUsd">;

/**
 * Where a harness records each model call's tokens, for one whose ACP usage
 * covers only part of a turn, such as only its last model call.
 */
export interface AcpTurnTokenReader {
  /**
   * What the model calls since `since` (epoch milliseconds) used, in these
   * sessions and any sessions they started, or null when it recorded none.
   */
  since(sessionIds: readonly string[], since: number): AcpRecordedUsage | null;
}
