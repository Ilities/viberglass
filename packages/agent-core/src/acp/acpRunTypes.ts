import type { AgentUsageReport } from "../usage";
import type { AcpSessionStart } from "./AcpSessionOpener";
import type { AcpContextUsage } from "./acpSessionSignals";
import type { AcpSessionUsageReader } from "./AcpSessionUsage";
import type { AcpTurnTokenReader } from "./AcpTurnTokenReader";
import type { AcpProviderRetryReader } from "./providerRetry";
import type { AcpMcpServer } from "./types";

export interface AcpRunOptions {
  userMessage: string;
  /** CLI's own session ID (sess_abc123) — present on turns after the first. */
  acpSessionId?: string;
  /**
   * Sent instead of `userMessage` when the turn starts cold: a continued
   * session already has the context this carries, a fresh one doesn't.
   */
  coldStartMessage?: string;
  /**
   * After the turn, ask the harness to compact its context with these
   * instructions, when it has a compact command.
   */
  compactInstructions?: string;
  /** MCP servers the harness offers the agent as tools for this turn. */
  mcpServers?: AcpMcpServer[];
  /** Where the harness records the provider refusals it waits out, for one that says nothing over ACP meanwhile. */
  providerRetries?: AcpProviderRetryReader;
  /** Where the harness records each model call's tokens, for one whose ACP usage leaves some out. */
  turnTokens?: AcpTurnTokenReader;
  /** Where the harness says its session's running totals, for one whose prompt results report those instead of the prompt's own. */
  sessionUsage?: AcpSessionUsageReader;
}

export interface AcpRunResult {
  acpSessionId: string;
  /** Whether the turn continued the harness's earlier session, or started cold and why. */
  sessionStart: AcpSessionStart;
  /** How full the harness's context was at the end of the turn, when it said. */
  contextUsage?: AcpContextUsage;
  /** Whether the harness compacted its context after the turn. */
  compacted: boolean;
  /** The turn's tokens and cost, when the harness reported them. */
  usage?: AgentUsageReport;
  /** The model the turn's responses came from, else the one the harness said the session runs, when it said. */
  model?: string;
}
