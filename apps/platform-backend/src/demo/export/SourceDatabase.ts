import { escapeIdentifier, type Pool } from "pg";
import type { ColumnInfo } from "../bundle/DatabaseSchema";
import { eachString, type Row } from "../bundle/jsonValues";
import type { ForbiddenValue } from "./SecretScanner";

/** Columns whose values must never show up in an export, wherever they would. */
const FORBIDDEN_COLUMNS: ReadonlyArray<{ table: string; column: string; kind: string }> = [
  { table: "users", column: "password_hash", kind: "password hash" },
  { table: "users", column: "email", kind: "a real email address" },
  { table: "user_sessions", column: "token_hash", kind: "session token" },
  { table: "api_tokens", column: "token_hash", kind: "API token" },
  { table: "invites", column: "token_hash", kind: "invite token" },
  { table: "password_reset_links", column: "token_hash", kind: "password reset token" },
  { table: "secrets", column: "secret_value_encrypted", kind: "stored secret" },
  { table: "webhook_provider_configs", column: "webhook_secret_encrypted", kind: "webhook secret" },
  { table: "jobs", column: "callback_token", kind: "callback token" },
  { table: "app_sessions", column: "token_hash", kind: "app session token" },
  { table: "app_handoff_codes", column: "code_hash", kind: "app sign-in code" },
  { table: "mcp_servers", column: "headers", kind: "MCP server header" },
  { table: "model_endpoints", column: "extra_headers", kind: "model endpoint header" },
];

/** Short header values are words like "application/json" that turn up everywhere. */
const MIN_HEADER_VALUE_LENGTH = 16;

/** Reads a source instance's rows. Read-only: it only ever selects. */
export class SourceDatabase {
  constructor(private readonly db: Pick<Pool, "query">) {}

  async rows(table: string): Promise<Row[]> {
    const result = await this.db.query<Row>(`SELECT * FROM ${escapeIdentifier(table)} ORDER BY 1`);
    return result.rows;
  }

  async forbiddenValues(columns: ReadonlyMap<string, readonly ColumnInfo[]>): Promise<ForbiddenValue[]> {
    const values: ForbiddenValue[] = [];
    for (const { table, column, kind } of FORBIDDEN_COLUMNS) {
      const info = columns.get(table)?.find((candidate) => candidate.name === column);
      if (!info) continue;
      const result = await this.db.query<{ value: unknown }>(
        `SELECT ${escapeIdentifier(column)} AS value FROM ${escapeIdentifier(table)} WHERE ${escapeIdentifier(column)} IS NOT NULL`,
      );
      for (const { value } of result.rows) {
        if (typeof value === "string") values.push({ kind, value });
        else eachString(value, (text) => text.length >= MIN_HEADER_VALUE_LENGTH && values.push({ kind, value: text }));
      }
    }
    return values;
  }
}
