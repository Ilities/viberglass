import type { AcpSessionTotals, AcpUsageProbe } from "@viberglass/agent-core";
import { readKimiWireTotals } from "./kimiWireUsage";

const tokenCount = (text: string | undefined): number | undefined => {
  if (text === undefined) return undefined;
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

/**
 * Reads the output tokens from Kimi Code's `/usage` answer: "Session total:
 * 32529 input, 205 output", the session's totals. Its input count has cached
 * tokens in it, which the record keeps apart, so it isn't read.
 */
export function parseKimiSessionStats(text: string): AcpSessionTotals | null {
  const totals = /Session total:\s*(.+)$/m.exec(text)?.[1];
  const outputTokens = totals ? tokenCount(/([\d,]+) output/.exec(totals)?.[1]) : undefined;
  return outputTokens === undefined ? null : { outputTokens };
}

/**
 * Kimi sends no token usage over ACP. Its `/usage` command, which it answers
 * itself, comes after the turn's model calls are in the session's logs, so
 * the totals are read from those, and from the answer when there are none.
 */
export function kimiUsageProbe(kimiHome: string): AcpUsageProbe {
  return {
    command: "/usage",
    parse: (text, sessionId) => readKimiWireTotals(kimiHome, sessionId) ?? parseKimiSessionStats(text),
  };
}
