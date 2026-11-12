import { sql, type RawBuilder } from "kysely";
import type { OutputKind, OutputProducer } from "@viberglass/types";

/** What one person asked Outputs for, already limited to the spaces they see. */
export interface OutputFilter {
  /** Null means every space (admins). */
  projectIds: string[] | null;
  spaceId?: string;
  kind?: OutputKind;
  producer?: OutputProducer;
  q?: string;
  latest: boolean;
}

/** Where a page ends: the last item's time, to the millisecond, and id. */
export interface OutputCursor {
  at: Date;
  id: string;
}

export function encodeCursor(cursor: OutputCursor): string {
  return Buffer.from(JSON.stringify([cursor.at.toISOString(), cursor.id])).toString("base64url");
}

export function decodeCursor(value: string): OutputCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || typeof parsed[0] !== "string" || typeof parsed[1] !== "string") return null;
    const at = new Date(parsed[0]);
    return Number.isNaN(at.getTime()) ? null : { at, id: parsed[1] };
  } catch {
    return null;
  }
}

/**
 * The time and id each kind of output is ordered by. Times are cut to the
 * millisecond a cursor can carry, and ids compare bytewise, so every source
 * pages in the same order the merged list is sorted in.
 */
export function outputOrder(createdAt: string, prefix: string, rowId: string): { at: RawBuilder<Date>; id: RawBuilder<string> } {
  return {
    at: sql<Date>`date_trunc('milliseconds', ${sql.ref(createdAt)})`,
    id: sql<string>`(${prefix} || ${sql.ref(rowId)}::text) collate "C"`,
  };
}

export function before(order: { at: RawBuilder<Date>; id: RawBuilder<string> }, cursor: OutputCursor): RawBuilder<boolean> {
  return sql<boolean>`(${order.at}, ${order.id}) < (${cursor.at}, ${cursor.id} collate "C")`;
}

export function searchPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Bytewise, as Postgres orders `collate "C"`. */
export function compareOutputs(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}
