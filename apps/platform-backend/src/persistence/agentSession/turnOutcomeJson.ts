import { isObjectRecord, type TaskTurnOutcome, type TaskTurnProduct } from "@viberglass/types";
import type { JsonValue } from "../types/database";

const PRODUCTS: readonly TaskTurnProduct[] = ["research", "plan", "code", "summary"];

/** The outcome a finished turn stored (TaskTurnOutcomeService); null before it finished, or for turns from before turns had one. */
export function outcomeOf(json: JsonValue | null): TaskTurnOutcome | null {
  if (!isObjectRecord(json) || typeof json.reply !== "string") return null;
  const produced = Array.isArray(json.produced) ? json.produced : [];
  return {
    intent: typeof json.intent === "string" ? json.intent : null,
    reply: json.reply,
    produced: PRODUCTS.filter((product) => produced.includes(product)),
    codeDiscarded: json.codeDiscarded === true,
    resumed: typeof json.resumed === "boolean" ? json.resumed : null,
    mentioned: Array.isArray(json.mentioned) ? json.mentioned.filter(isPerson) : [],
    contextUsage: contextUsageOf(json.contextUsage),
    compacted: json.compacted === true,
  };
}

function contextUsageOf(value: JsonValue | undefined): TaskTurnOutcome["contextUsage"] {
  if (!isObjectRecord(value) || typeof value.used !== "number") return null;
  return { used: value.used, size: typeof value.size === "number" ? value.size : null };
}

function isPerson(value: JsonValue): value is { id: string; name: string } {
  return isObjectRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}
