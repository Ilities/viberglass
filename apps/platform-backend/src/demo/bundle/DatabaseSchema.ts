import type { Pool, PoolClient } from "pg";

export interface ColumnInfo {
  name: string;
  /** information_schema data_type, such as "jsonb", "ARRAY" or "timestamp with time zone". */
  type: string;
  nullable: boolean;
}

export interface ForeignKey {
  table: string;
  column: string;
  references: string;
  referencedColumn: string;
  nullable: boolean;
}

export interface SchemaSnapshot {
  columns: Map<string, ColumnInfo[]>;
  foreignKeys: ForeignKey[];
  primaryKeys: Map<string, string[]>;
}

export const isTimestampType = (type: string): boolean => type.startsWith("timestamp");
export const isJsonType = (type: string): boolean => type === "json" || type === "jsonb";

type Queryable = Pick<Pool | PoolClient, "query">;

/** Reads the public schema's tables, columns and keys. */
export class DatabaseSchema {
  constructor(private readonly db: Queryable) {}

  async read(): Promise<SchemaSnapshot> {
    // One after another: the seed reads through a single connection.
    const columns = await this.columns();
    const foreignKeys = await this.foreignKeys();
    const primaryKeys = await this.primaryKeys();
    return { columns, foreignKeys, primaryKeys };
  }

  private async columns(): Promise<Map<string, ColumnInfo[]>> {
    const result = await this.db.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
      `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable
         FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name, c.ordinal_position`,
    );
    const columns = new Map<string, ColumnInfo[]>();
    for (const row of result.rows) {
      const list = columns.get(row.table_name) ?? [];
      list.push({ name: row.column_name, type: row.data_type, nullable: row.is_nullable === "YES" });
      columns.set(row.table_name, list);
    }
    return columns;
  }

  private async foreignKeys(): Promise<ForeignKey[]> {
    const result = await this.db.query<{ table_name: string; column_name: string; references: string; referenced_column: string; not_null: boolean }>(
      `SELECT c.conrelid::regclass::text AS table_name, a.attname AS column_name,
              c.confrelid::regclass::text AS references, r.attname AS referenced_column, a.attnotnull AS not_null
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         JOIN pg_attribute r ON r.attrelid = c.confrelid AND r.attnum = c.confkey[1]
        WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND array_length(c.conkey, 1) = 1`,
    );
    return result.rows.map((row) => ({
      table: row.table_name,
      column: row.column_name,
      references: row.references,
      referencedColumn: row.referenced_column,
      nullable: !row.not_null,
    }));
  }

  private async primaryKeys(): Promise<Map<string, string[]>> {
    const result = await this.db.query<{ table_name: string; column_name: string }>(
      `SELECT c.conrelid::regclass::text AS table_name, a.attname AS column_name
         FROM pg_constraint c
         JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, position) ON true
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.contype = 'p' AND c.connamespace = 'public'::regnamespace
        ORDER BY 1, k.position`,
    );
    const keys = new Map<string, string[]>();
    for (const row of result.rows) keys.set(row.table_name, [...(keys.get(row.table_name) ?? []), row.column_name]);
    return keys;
  }
}
