import type { AgentUsageReport } from "../usage";

export type AcpTurnTokens = Pick<
  AgentUsageReport,
  "inputTokens" | "outputTokens" | "reasoningOutputTokens" | "cacheReadInputTokens" | "cacheCreationInputTokens"
>;

/**
 * Where a harness records each model call's tokens, for one whose ACP usage
 * covers only part of a turn, such as only its last model call.
 */
export interface AcpTurnTokenReader {
  /** What the session's model calls since `since` (epoch milliseconds) used, or null when it recorded none. */
  since(sessionId: string, since: number): AcpTurnTokens | null;
}
