import type { Selectable } from "kysely";
import { isObjectRecord, type McpServer, type McpServerHeader, type McpServerInput } from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

type McpServerRow = Selectable<Database["mcp_servers"]>;

/** Reads stored headers, dropping entries that aren't headers. */
function parseHeaders(value: unknown): McpServerHeader[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown): McpServerHeader[] => {
    if (!isObjectRecord(entry) || typeof entry.name !== "string") return [];
    if (typeof entry.secretId === "string") {
      return [{ name: entry.name, secretId: entry.secretId, ...(typeof entry.prefix === "string" ? { prefix: entry.prefix } : {}) }];
    }
    return typeof entry.value === "string" ? [{ name: entry.name, value: entry.value }] : [];
  });
}

function toMcpServer(row: McpServerRow): McpServer {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    url: row.url,
    headers: parseHeaders(row.headers),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class McpServerDAO {
  async list(): Promise<McpServer[]> {
    const rows = await db.selectFrom("mcp_servers").selectAll().orderBy("name", "asc").execute();
    return rows.map(toMcpServer);
  }

  async get(id: string): Promise<McpServer | null> {
    const row = await db.selectFrom("mcp_servers").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? toMcpServer(row) : null;
  }

  async getByIds(ids: string[]): Promise<McpServer[]> {
    if (ids.length === 0) return [];
    const rows = await db.selectFrom("mcp_servers").selectAll().where("id", "in", ids).orderBy("name", "asc").execute();
    return rows.map(toMcpServer);
  }

  async findByName(name: string): Promise<McpServer | null> {
    const row = await db.selectFrom("mcp_servers").selectAll().where("name", "=", name).executeTakeFirst();
    return row ? toMcpServer(row) : null;
  }

  async create(input: McpServerInput): Promise<McpServer> {
    const row = await db
      .insertInto("mcp_servers")
      .values({
        name: input.name,
        description: input.description ?? null,
        url: input.url,
        headers: JSON.stringify(input.headers ?? []),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toMcpServer(row);
  }

  async update(id: string, input: McpServerInput): Promise<McpServer | null> {
    const row = await db
      .updateTable("mcp_servers")
      .set({
        name: input.name,
        description: input.description ?? null,
        url: input.url,
        headers: JSON.stringify(input.headers ?? []),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    return row ? toMcpServer(row) : null;
  }

  async delete(id: string): Promise<void> {
    await db.deleteFrom("mcp_servers").where("id", "=", id).execute();
  }

  /** The runners that give their agent this server, by name. */
  async runnersUsing(id: string): Promise<string[]> {
    const rows = await db
      .selectFrom("clanker_mcp_servers")
      .innerJoin("clankers", "clankers.id", "clanker_mcp_servers.clanker_id")
      .select("clankers.name")
      .where("clanker_mcp_servers.mcp_server_id", "=", id)
      .orderBy("clankers.name", "asc")
      .execute();
    return rows.map((row) => row.name);
  }
}
