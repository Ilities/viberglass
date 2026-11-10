import type { AcpProviderRetry } from "@viberglass/agent-core";
import { isRecord } from "./kimiWireFiles";

type WireRecord = Record<string, unknown>;

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const number = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

function lastOfType(records: WireRecord[], type: string): WireRecord | undefined {
  for (let i = records.length - 1; i >= 0; i--) if (records[i].type === type) return records[i];
  return undefined;
}

/** The model call Kimi Code is waiting to try again, from its `turn.step.retrying` record. */
export function kimiProviderRetry(records: WireRecord[]): AcpProviderRetry | undefined {
  const retrying = lastOfType(records, "turn.step.retrying");
  const at = number(retrying?.time);
  const delayMs = number(retrying?.delayMs);
  if (!retrying || at === undefined || delayMs === undefined) return undefined;
  const error = text(retrying.errorMessage) ?? text(retrying.errorName) ?? "the model request failed";
  return { at, retryAt: at + delayMs, error, status: number(retrying.statusCode) };
}

/**
 * The error of a turn Kimi Code gave up on. Its ACP server ends a failed turn
 * like a finished one, so the session's log is what says it failed.
 */
export function kimiTurnError(records: WireRecord[]): string | undefined {
  const ended = lastOfType(records, "turn.ended");
  if (ended?.reason !== "failed") return undefined;
  const error = isRecord(ended.error) ? ended.error : {};
  const details = isRecord(error.details) ? error.details : {};
  const status = number(details.statusCode);
  const label = [text(error.code), status ? `HTTP ${status}` : undefined].filter(Boolean).join(", ");
  const message = text(error.message) ?? "Kimi Code's turn failed";
  return label ? `${message} (${label})` : message;
}
