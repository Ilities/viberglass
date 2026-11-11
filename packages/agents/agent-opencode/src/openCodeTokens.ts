import * as fs from "fs";
import * as path from "path";
import type { AcpTurnTokenReader, AcpTurnTokens } from "@viberglass/agent-core";

const RECORDS_FILE = "viberglass-tokens.jsonl";
const PLUGIN_FILE = path.join("plugin", "viberglass-tokens.js");

/**
 * An OpenCode plugin that records each model call's tokens as its step
 * finishes. OpenCode's ACP answer to a prompt carries only the last model
 * call's tokens, so a turn with many tool calls looked almost free.
 */
function recorderSource(recordsFile: string): string {
  return `import { appendFileSync } from "node:fs";

export const ViberglassTokens = async () => ({
  event: async ({ event }) => {
    const part = String(event.type).startsWith("message.part.updated") ? event.properties?.part : undefined;
    if (part?.type !== "step-finish" || !part.tokens) return;
    const record = { sessionId: part.sessionID, partId: part.id, at: Date.now(), tokens: part.tokens };
    try {
      appendFileSync(${JSON.stringify(recordsFile)}, JSON.stringify(record) + "\\n");
    } catch {}
  },
});
`;
}

/** Puts the recorder among the plugins OpenCode loads from its config directory. */
export function writeOpenCodeTokenRecorder(configDir: string): void {
  const file = path.join(configDir, PLUGIN_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, recorderSource(path.join(configDir, RECORDS_FILE)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

interface StepRecord {
  partId: string;
  tokens: AcpTurnTokens;
}

function stepOf(line: string, sessionId: string, since: number): StepRecord | undefined {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(record) || record.sessionId !== sessionId || typeof record.partId !== "string") return undefined;
  if (typeof record.at !== "number" || record.at < since || !isRecord(record.tokens)) return undefined;
  const { tokens } = record;
  const cache = isRecord(tokens.cache) ? tokens.cache : {};
  return {
    partId: record.partId,
    tokens: {
      inputTokens: count(tokens.input),
      outputTokens: count(tokens.output),
      reasoningOutputTokens: count(tokens.reasoning),
      cacheReadInputTokens: count(cache.read),
      cacheCreationInputTokens: count(cache.write),
    },
  };
}

function sum(steps: AcpTurnTokens[]): AcpTurnTokens {
  const total = (key: keyof AcpTurnTokens) => steps.reduce((acc, step) => acc + (step[key] ?? 0), 0);
  return {
    inputTokens: total("inputTokens"),
    outputTokens: total("outputTokens"),
    reasoningOutputTokens: total("reasoningOutputTokens"),
    cacheReadInputTokens: total("cacheReadInputTokens"),
    cacheCreationInputTokens: total("cacheCreationInputTokens"),
  };
}

/** Every model call the recorder saw for a session since a time, added up; a step updated twice counts once. */
export function openCodeTokens(configDir: string): AcpTurnTokenReader {
  const file = path.join(configDir, RECORDS_FILE);
  return {
    since(sessionId, since) {
      if (!fs.existsSync(file)) return null;
      const steps = new Map<string, AcpTurnTokens>();
      for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
        const step = stepOf(line, sessionId, since);
        if (step) steps.set(step.partId, step.tokens);
      }
      return steps.size > 0 ? sum([...steps.values()]) : null;
    },
  };
}
