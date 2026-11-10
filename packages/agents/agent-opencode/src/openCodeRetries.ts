import * as fs from "fs";
import * as path from "path";
import type { AcpProviderRetry, AcpProviderRetryReader } from "@viberglass/agent-core";

const RECORDS_FILE = "viberglass-retries.jsonl";
const PLUGIN_FILE = path.join("plugin", "viberglass-retries.js");

/**
 * An OpenCode plugin that records each model request OpenCode waits to try
 * again. OpenCode waits as long as the provider's Retry-After says, hours for
 * a usage limit, and its ACP server says nothing meanwhile.
 */
function recorderSource(recordsFile: string): string {
  return `import { appendFileSync } from "node:fs";

export const ViberglassRetries = async () => ({
  event: async ({ event }) => {
    const status = event.type === "session.status" ? event.properties.status : undefined;
    if (status?.type !== "retry") return;
    const record = { sessionId: event.properties.sessionID, at: Date.now(), retryAt: status.next, message: status.message };
    try {
      appendFileSync(${JSON.stringify(recordsFile)}, JSON.stringify(record) + "\\n");
    } catch {}
  },
});
`;
}

/** Puts the recorder among the plugins OpenCode loads from its config directory. */
export function writeOpenCodeRetryRecorder(configDir: string): void {
  const file = path.join(configDir, PLUGIN_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, recorderSource(path.join(configDir, RECORDS_FILE)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function retryOf(line: string, sessionId: string): AcpProviderRetry | undefined {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(record) || record.sessionId !== sessionId) return undefined;
  const { at, retryAt, message } = record;
  if (typeof at !== "number" || typeof retryAt !== "number") return undefined;
  return { at, retryAt, error: typeof message === "string" && message.trim() ? message.trim() : "the model request failed" };
}

/** The recorder's latest record for a session. */
export function openCodeRetries(configDir: string): AcpProviderRetryReader {
  const file = path.join(configDir, RECORDS_FILE);
  return {
    latest(sessionId) {
      if (!fs.existsSync(file)) return undefined;
      const lines = fs.readFileSync(file, "utf-8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const retry = retryOf(lines[i], sessionId);
        if (retry) return retry;
      }
      return undefined;
    },
  };
}
