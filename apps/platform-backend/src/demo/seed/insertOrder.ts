import type { ForeignKey } from "../bundle/DatabaseSchema";

export interface InsertPlan {
  order: string[];
  /** Per table, references inserted as null and filled in once every table is in. */
  deferred: Map<string, string[]>;
}

/**
 * Orders tables so each comes after the tables it references. References that
 * form a cycle, a row pointing at another row of its own table included, are
 * deferred; only nullable ones can be.
 */
export function insertOrder(tables: readonly string[], foreignKeys: readonly ForeignKey[]): InsertPlan {
  const present = new Set(tables);
  const deferred = new Map<string, string[]>();
  const defer = (key: ForeignKey) => deferred.set(key.table, [...(deferred.get(key.table) ?? []), key.column]);
  const pending = new Map<string, ForeignKey[]>();
  for (const table of tables) {
    const keys = foreignKeys.filter((key) => key.table === table && present.has(key.references));
    keys.filter((key) => key.references === table).forEach(defer);
    pending.set(table, keys.filter((key) => key.references !== table));
  }

  const order: string[] = [];
  const done = new Set<string>();
  const remaining = [...tables];
  const blockers = (table: string) => (pending.get(table) ?? []).filter((key) => !done.has(key.references));
  while (remaining.length > 0) {
    let index = remaining.findIndex((table) => blockers(table).length === 0);
    if (index === -1) {
      index = remaining.findIndex((table) => blockers(table).every((key) => key.nullable));
      if (index === -1) throw new Error(`Tables reference each other through required columns: ${remaining.join(", ")}`);
      const table = remaining[index];
      blockers(table).forEach(defer);
      pending.set(table, (pending.get(table) ?? []).filter((key) => done.has(key.references)));
    }
    const [table] = remaining.splice(index, 1);
    order.push(table);
    done.add(table);
  }
  return { order, deferred };
}
