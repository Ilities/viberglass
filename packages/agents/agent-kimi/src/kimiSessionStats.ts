import type { AcpSessionTotals, AcpUsageProbe } from "@viberglass/agent-core";

const tokenCount = (text: string | undefined): number | undefined => {
  if (text === undefined) return undefined;
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

/**
 * Reads Kimi Code's `/usage` answer: "Session total: 32529 input, 205 output",
 * the session's totals. Kimi answers it itself, without the model, and sends
 * no token usage over ACP otherwise.
 */
export function parseKimiSessionStats(text: string): AcpSessionTotals | null {
  const totals = /Session total:\s*(.+)$/m.exec(text)?.[1];
  if (!totals) return null;
  const part = (label: string) => tokenCount(new RegExp(`([\\d,]+) ${label}`).exec(totals)?.[1]);
  const read: AcpSessionTotals = { inputTokens: part("input"), outputTokens: part("output") };
  return read.inputTokens !== undefined || read.outputTokens !== undefined ? read : null;
}

export const kimiUsageProbe: AcpUsageProbe = { command: "/usage", parse: parseKimiSessionStats };
