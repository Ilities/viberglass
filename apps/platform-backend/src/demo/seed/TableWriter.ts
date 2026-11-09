import { escapeIdentifier, type PoolClient } from "pg";
import { isJsonType, type ColumnInfo } from "../bundle/DatabaseSchema";
import type { Row } from "../bundle/jsonValues";

const MAX_PARAMETERS = 60_000;

function encode(value: unknown, column: ColumnInfo): unknown {
  if (value === undefined || value === null) return null;
  return isJsonType(column.type) ? JSON.stringify(value) : value;
}

/** Writes bundle rows into one table, leaving deferred references for a second pass. */
export class TableWriter {
  constructor(
    private readonly db: Pick<PoolClient, "query">,
    private readonly log: (line: string) => void,
  ) {}

  async insert(table: string, rows: readonly Row[], columns: readonly ColumnInfo[], deferred: readonly string[]): Promise<void> {
    if (rows.length === 0) return;
    const used = this.usedColumns(table, rows, columns);
    const skipped = new Set(deferred);
    const size = Math.max(1, Math.floor(MAX_PARAMETERS / used.length));
    const names = used.map((column) => escapeIdentifier(column.name)).join(", ");
    for (let start = 0; start < rows.length; start += size) {
      const batch = rows.slice(start, start + size);
      const parameters: unknown[] = [];
      const tuples = batch.map((row) => {
        const placeholders = used.map((column) => {
          parameters.push(skipped.has(column.name) ? null : encode(row[column.name], column));
          return `$${parameters.length}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await this.db.query(`INSERT INTO ${escapeIdentifier(table)} (${names}) VALUES ${tuples.join(", ")}`, parameters);
    }
  }

  async fillDeferred(table: string, rows: readonly Row[], columns: readonly ColumnInfo[], deferred: readonly string[], primaryKey: readonly string[]): Promise<void> {
    if (deferred.length === 0) return;
    if (primaryKey.length === 0) throw new Error(`${table} has no primary key to fill in ${deferred.join(", ")}`);
    const byName = new Map(columns.map((column) => [column.name, column]));
    const targets = deferred.filter((name) => byName.has(name));
    for (const row of rows) {
      const set = targets.filter((name) => row[name] !== null && row[name] !== undefined);
      if (set.length === 0) continue;
      const parameters: unknown[] = [];
      const assignments = set.map((name) => {
        const column = byName.get(name);
        parameters.push(column ? encode(row[name], column) : row[name]);
        return `${escapeIdentifier(name)} = $${parameters.length}`;
      });
      const conditions = primaryKey.map((name) => {
        parameters.push(row[name]);
        return `${escapeIdentifier(name)} = $${parameters.length}`;
      });
      await this.db.query(`UPDATE ${escapeIdentifier(table)} SET ${assignments.join(", ")} WHERE ${conditions.join(" AND ")}`, parameters);
    }
  }

  private usedColumns(table: string, rows: readonly Row[], columns: readonly ColumnInfo[]): ColumnInfo[] {
    const present = new Set(rows.flatMap((row) => Object.keys(row)));
    const known = new Set(columns.map((column) => column.name));
    const unknown = [...present].filter((name) => !known.has(name));
    if (unknown.length > 0) this.log(`${table}: the database has no ${unknown.join(", ")}; left out`);
    return columns.filter((column) => present.has(column.name));
  }
}
