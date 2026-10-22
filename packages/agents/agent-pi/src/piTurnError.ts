import * as fs from "fs";
import * as path from "path";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** The error a Pi session's last reply ended with, from the lines of its session file. */
export function lastReplyError(sessionLines: string[]): string | undefined {
  for (const line of [...sessionLines].reverse()) {
    const entry = parseLine(line);
    if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) continue;
    const message = entry.message;
    if (message.role !== "assistant") continue;
    if (message.stopReason !== "error") return undefined;
    return typeof message.errorMessage === "string" && message.errorMessage ? message.errorMessage : "Pi stopped with an error";
  }
  return undefined;
}

/**
 * pi-acp ends a turn normally when the model call fails, a rejected key
 * included, and passes nothing on; Pi records the error in the session's file
 * (`<timestamp>_<session id>.jsonl`).
 */
export function piTurnError(sessionDirectory: string, sessionId: string): string | undefined {
  let files: string[];
  try {
    files = fs.readdirSync(sessionDirectory);
  } catch {
    return undefined;
  }
  const file = files.find((name) => name.endsWith(`_${sessionId}.jsonl`));
  if (!file) return undefined;
  return lastReplyError(fs.readFileSync(path.join(sessionDirectory, file), "utf-8").split("\n"));
}
