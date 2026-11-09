import { isObjectRecord } from "@viberglass/types";

export type Row = Record<string, unknown>;

/** Applies `map` to every string in a JSON-shaped value, at any depth. */
export function mapStrings(value: unknown, map: (text: string) => string): unknown {
  if (typeof value === "string") return map(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, map));
  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, map)]));
  }
  return value;
}

/** Drops the named keys from every object in a JSON-shaped value, at any depth. */
export function withoutKeys(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => withoutKeys(item, keys));
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !keys.has(key))
        .map(([key, item]) => [key, withoutKeys(item, keys)]),
    );
  }
  return value;
}

export function eachString(value: unknown, visit: (text: string) => void): void {
  if (typeof value === "string") visit(value);
  else if (Array.isArray(value)) value.forEach((item) => eachString(item, visit));
  else if (isPlainRecord(value)) Object.values(value).forEach((item) => eachString(item, visit));
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isObjectRecord(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function textValue(row: Row, column: string): string | null {
  const value = row[column];
  return typeof value === "string" ? value : null;
}

/** Ids are uuids or text; anything else is no id. */
export function idValue(row: Row, column: string): string | null {
  const value = row[column];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}
