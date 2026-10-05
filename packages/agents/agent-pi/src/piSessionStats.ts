import type { AcpSessionTotals, AcpUsageProbe } from "@viberglass/agent-core";

const number = (text: string | undefined): number | undefined => {
  if (text === undefined) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

/**
 * Reads pi-acp's `/session` answer: "Cost: 0.0123" and "Tokens: in 2410,
 * out 310, cache read 1200, cache write 0, total 3920", the session's totals.
 * pi-acp answers it itself, without the model, and sends usage over ACP no
 * other way.
 */
export function parsePiSessionStats(text: string): AcpSessionTotals | null {
  const tokens = /^Tokens:\s*(.+)$/m.exec(text)?.[1] ?? "";
  const part = (label: string) => number(new RegExp(`(?:^|,\\s*)${label} (\\d+)`).exec(tokens)?.[1]);
  const totals: AcpSessionTotals = {
    inputTokens: part("in"),
    outputTokens: part("out"),
    cacheReadInputTokens: part("cache read"),
    cacheCreationInputTokens: part("cache write"),
    costUsd: number(/^Cost:\s*([\d.eE+-]+)\s*$/m.exec(text)?.[1]),
  };
  // Pi prices a custom endpoint's model at 0 when it isn't told its price, so a zero cost for real tokens says nothing.
  const usedTokens = (totals.inputTokens ?? 0) + (totals.outputTokens ?? 0) > 0;
  if (totals.costUsd === 0 && usedTokens) totals.costUsd = undefined;
  return Object.values(totals).some((value) => value !== undefined) ? totals : null;
}

export const piUsageProbe: AcpUsageProbe = { command: "/session", parse: parsePiSessionStats };
