import * as fs from "fs";
import * as path from "path";
import type { AcpSessionTotals } from "@viberglass/agent-core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function listDirectory(directory: string): string[] {
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

/** Each agent's event log in a session: `sessions/<workspace>/<session>/agents/<agent>/wire.jsonl`, subagents included. */
function wireFiles(kimiHome: string, sessionId: string): string[] {
  const sessions = path.join(kimiHome, "sessions");
  return listDirectory(sessions).flatMap((workspace) => {
    const agents = path.join(sessions, workspace, sessionId, "agents");
    return listDirectory(agents)
      .map((agent) => path.join(agents, agent, "wire.jsonl"))
      .filter((file) => fs.existsSync(file));
  });
}

/** Adds up a log's `usage.record` lines, one per model call, with its input split into fresh, cache-read and cache-written. */
function addWireUsage(totals: Required<Omit<AcpSessionTotals, "costUsd">>, lines: string[]): void {
  for (const line of lines) {
    const entry = parseLine(line);
    if (!isRecord(entry) || entry.type !== "usage.record" || !isRecord(entry.usage)) continue;
    totals.inputTokens += count(entry.usage.inputOther);
    totals.outputTokens += count(entry.usage.output);
    totals.cacheReadInputTokens += count(entry.usage.inputCacheRead);
    totals.cacheCreationInputTokens += count(entry.usage.inputCacheCreation);
  }
}

/**
 * A Kimi Code session's token totals from its event logs. Kimi's `/usage`
 * answer can't say: it gives input as one number, or "input unknown" once a
 * model call came back without a cache count. Null when the session has no logs.
 */
export function readKimiWireTotals(kimiHome: string, sessionId: string): AcpSessionTotals | null {
  const files = wireFiles(kimiHome, sessionId);
  if (files.length === 0) return null;
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
  for (const file of files) addWireUsage(totals, fs.readFileSync(file, "utf-8").split("\n"));
  return totals;
}
