import * as fs from "fs";
import * as path from "path";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWireLine(line: string): unknown {
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
export function wireFiles(kimiHome: string, sessionId: string, agent?: string): string[] {
  const sessions = path.join(kimiHome, "sessions");
  return listDirectory(sessions).flatMap((workspace) => {
    const agents = path.join(sessions, workspace, sessionId, "agents");
    return (agent ? [agent] : listDirectory(agents))
      .map((name) => path.join(agents, name, "wire.jsonl"))
      .filter((file) => fs.existsSync(file));
  });
}

/** The records of the session's main agent's event log, oldest first; empty when it has none. */
export function mainAgentRecords(kimiHome: string, sessionId: string): Record<string, unknown>[] {
  const [file] = wireFiles(kimiHome, sessionId, "main");
  if (!file) return [];
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .map(parseWireLine)
    .filter(isRecord);
}
