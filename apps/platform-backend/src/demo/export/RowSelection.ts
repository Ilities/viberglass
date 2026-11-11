import type { ForeignKey } from "../bundle/DatabaseSchema";
import type { Row } from "../bundle/jsonValues";
import type { KeptRows, SelectionContext, TablePolicy } from "./tablePolicies";

type Tables = Map<string, Row[]>;

const asKey = (value: unknown): string | null => (typeof value === "string" || typeof value === "number" ? String(value) : null);

function keptRows(tables: Tables): KeptRows {
  return {
    values(table, column) {
      const values = new Set<string>();
      for (const row of tables.get(table) ?? []) {
        const value = asKey(row[column]);
        if (value !== null) values.add(value);
      }
      return values;
    },
  };
}

/**
 * Picks the rows an export keeps: those its table's policy keeps, then only
 * those whose references still hold. A reference to a row that isn't kept is
 * cleared when the column allows it and drops the row when it doesn't.
 */
export class RowSelection {
  constructor(
    private readonly policies: Readonly<Record<string, TablePolicy>>,
    private readonly foreignKeys: readonly ForeignKey[],
  ) {}

  select(source: Tables, context: SelectionContext): Tables {
    let tables: Tables = new Map();
    for (const [table, policy] of Object.entries(this.policies)) {
      const rows = source.get(table);
      if (rows) tables.set(table, rows.filter((row) => policy.keep?.(row, context) ?? true));
    }
    for (;;) {
      const settled = this.settleReferences(tables);
      const pruned = this.pruneUnreferenced(settled.tables);
      tables = pruned.tables;
      if (!settled.changed && !pruned.changed) return tables;
    }
  }

  private settleReferences(tables: Tables): { tables: Tables; changed: boolean } {
    let changed = false;
    const settled: Tables = new Map();
    for (const [table, rows] of tables) {
      const keys = this.foreignKeys.filter((key) => key.table === table);
      const owners = new Set(this.policies[table]?.owners ?? []);
      const allowed = keys.map((key) => (tables.has(key.references) ? keptRows(tables).values(key.references, key.referencedColumn) : null));
      const next: Row[] = [];
      for (const row of rows) {
        let result: Row | null = row;
        keys.forEach((key, index) => {
          const value = result ? asKey(result[key.column]) : null;
          if (!result || value === null || allowed[index]?.has(value)) return;
          changed = true;
          result = key.nullable && !owners.has(key.column) ? { ...result, [key.column]: null } : null;
        });
        if (result) next.push(result);
      }
      settled.set(table, next);
    }
    return { tables: settled, changed };
  }

  private pruneUnreferenced(tables: Tables): { tables: Tables; changed: boolean } {
    let changed = false;
    const kept = keptRows(tables);
    const pruned: Tables = new Map();
    for (const [table, rows] of tables) {
      const keepWhile = this.policies[table]?.keepWhile;
      const next = keepWhile ? rows.filter((row) => keepWhile(row, kept)) : rows;
      if (next.length !== rows.length) changed = true;
      pruned.set(table, next);
    }
    return { tables: pruned, changed };
  }
}
