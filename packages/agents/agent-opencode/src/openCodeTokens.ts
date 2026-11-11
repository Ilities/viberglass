import * as fs from "fs";
import * as path from "path";
import type { AcpRecordedUsage, AcpTurnTokenReader, AcpTurnTokens } from "@viberglass/agent-core";

const RECORDS_FILE = "viberglass-tokens.jsonl";
const PLUGIN_FILE = path.join("plugin", "viberglass-tokens.js");

/**
 * An OpenCode plugin that records each model call's tokens and cost as its
 * step finishes, and which session started each subagent's session. OpenCode's
 * ACP answer to a prompt carries only the last model call's tokens, so a turn
 * with many tool calls looked almost free.
 */
function recorderSource(recordsFile: string): string {
  return `import { appendFileSync } from "node:fs";

function recordOf(event) {
  const type = String(event.type);
  if (type.startsWith("session.created")) {
    const info = event.properties?.info;
    return info?.id && info.parentID ? { sessionId: info.id, parentId: info.parentID } : undefined;
  }
  const part = type.startsWith("message.part.updated") ? event.properties?.part : undefined;
  if (part?.type !== "step-finish" || !part.tokens) return undefined;
  return { sessionId: part.sessionID, partId: part.id, tokens: part.tokens, cost: part.cost };
}

export const ViberglassTokens = async () => ({
  event: async ({ event }) => {
    const record = recordOf(event);
    if (!record) return;
    try {
      appendFileSync(${JSON.stringify(recordsFile)}, JSON.stringify({ ...record, at: Date.now() }) + "\\n");
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
  sessionId: string;
  at: number;
  tokens: AcpTurnTokens;
  cost?: number;
}

function stepOf(record: Record<string, unknown>): StepRecord | undefined {
  if (typeof record.partId !== "string" || typeof record.sessionId !== "string") return undefined;
  if (typeof record.at !== "number" || !isRecord(record.tokens)) return undefined;
  const { tokens } = record;
  const cache = isRecord(tokens.cache) ? tokens.cache : {};
  return {
    partId: record.partId,
    sessionId: record.sessionId,
    at: record.at,
    tokens: {
      inputTokens: count(tokens.input),
      outputTokens: count(tokens.output),
      reasoningOutputTokens: count(tokens.reasoning),
      cacheReadInputTokens: count(cache.read),
      cacheCreationInputTokens: count(cache.write),
    },
    ...(typeof record.cost === "number" && Number.isFinite(record.cost) && record.cost >= 0 ? { cost: record.cost } : {}),
  };
}

/** What the recorder wrote: each step by its part, a step updated twice counting once, and each subagent session's parent. */
class OpenCodeRecords {
  readonly steps = new Map<string, StepRecord>();
  private readonly children = new Map<string, string[]>();

  constructor(text: string) {
    for (const line of text.split("\n")) {
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(record)) continue;
      if (typeof record.parentId === "string" && typeof record.sessionId === "string") {
        this.children.set(record.parentId, [...(this.children.get(record.parentId) ?? []), record.sessionId]);
        continue;
      }
      const step = stepOf(record);
      if (step) this.steps.set(step.partId, step);
    }
  }

  /** These sessions and every session they started, however deep. */
  family(sessionIds: readonly string[]): Set<string> {
    const family = new Set<string>();
    const pending = [...sessionIds];
    for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
      if (family.has(id)) continue;
      family.add(id);
      pending.push(...(this.children.get(id) ?? []));
    }
    return family;
  }
}

function sum(steps: StepRecord[]): AcpRecordedUsage {
  const total = (key: keyof AcpTurnTokens) => steps.reduce((acc, step) => acc + (step.tokens[key] ?? 0), 0);
  const priced = steps.filter((step) => step.cost !== undefined);
  return {
    inputTokens: total("inputTokens"),
    outputTokens: total("outputTokens"),
    reasoningOutputTokens: total("reasoningOutputTokens"),
    cacheReadInputTokens: total("cacheReadInputTokens"),
    cacheCreationInputTokens: total("cacheCreationInputTokens"),
    ...(priced.length > 0 ? { costUsd: priced.reduce((acc, step) => acc + (step.cost ?? 0), 0) } : {}),
  };
}

/**
 * Every model call the recorder saw since a time in the turn's sessions, and
 * in the subagent sessions they started, added up.
 */
export function openCodeTokens(configDir: string): AcpTurnTokenReader {
  const file = path.join(configDir, RECORDS_FILE);
  return {
    since(sessionIds, since) {
      if (!fs.existsSync(file)) return null;
      const records = new OpenCodeRecords(fs.readFileSync(file, "utf-8"));
      const family = records.family(sessionIds);
      const steps = [...records.steps.values()].filter((step) => family.has(step.sessionId) && step.at >= since);
      return steps.length > 0 ? sum(steps) : null;
    },
  };
}
