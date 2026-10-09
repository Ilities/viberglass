import { isObjectRecord } from "@viberglass/types";

/** Reading untyped webhook payloads without trusting their shape. */
export function field(source: unknown, key: string): unknown {
  return isObjectRecord(source) ? source[key] : undefined;
}

export function recordAt(source: unknown, key: string): Record<string, unknown> | undefined {
  const value = field(source, key);
  return isObjectRecord(value) ? value : undefined;
}

export function stringAt(source: unknown, key: string): string | undefined {
  const value = field(source, key);
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** An id the tracker may send as a number or a string. */
export function idAt(source: unknown, key: string): string | undefined {
  const value = field(source, key);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
