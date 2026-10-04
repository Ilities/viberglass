import type { ModelEndpointSelection } from "@viberglass/types";
import db from "../config/database";

/** The workspace MCP servers and skills a runner gives its agent. */
export interface ClankerTools {
  mcpServerIds: string[];
  skillIds: string[];
  modelEndpoint?: ModelEndpointSelection | null;
}

const NO_TOOLS: ClankerTools = { mcpServerIds: [], skillIds: [] };

export class ClankerToolsDAO {
  async getForClankers(clankerIds: string[]): Promise<Map<string, ClankerTools>> {
    const byClanker = new Map<string, ClankerTools>(clankerIds.map((id) => [id, { mcpServerIds: [], skillIds: [] }]));
    if (clankerIds.length === 0) return byClanker;

    const [servers, skills, endpoints] = await Promise.all([
      db.selectFrom("clanker_mcp_servers").selectAll().where("clanker_id", "in", clankerIds).execute(),
      db.selectFrom("clanker_skills").selectAll().where("clanker_id", "in", clankerIds).execute(),
      db.selectFrom("clanker_model_endpoints").selectAll().where("clanker_id", "in", clankerIds).execute(),
    ]);
    for (const row of endpoints) {
      const entry = byClanker.get(row.clanker_id);
      if (entry) entry.modelEndpoint = { endpointId: row.endpoint_id, model: row.model };
    }
    for (const row of servers) byClanker.get(row.clanker_id)?.mcpServerIds.push(row.mcp_server_id);
    for (const row of skills) byClanker.get(row.clanker_id)?.skillIds.push(row.skill_id);
    return byClanker;
  }

  async get(clankerId: string): Promise<ClankerTools> {
    return (await this.getForClankers([clankerId])).get(clankerId) ?? NO_TOOLS;
  }

  /** Replaces whichever lists are given; a list left out stays as it was. */
  async replace(clankerId: string, tools: Partial<ClankerTools>): Promise<void> {
    await db.transaction().execute(async (trx) => {
      if (tools.modelEndpoint !== undefined) {
        await trx.deleteFrom("clanker_model_endpoints").where("clanker_id", "=", clankerId).execute();
        if (tools.modelEndpoint) {
          await trx.insertInto("clanker_model_endpoints").values({
            clanker_id: clankerId, endpoint_id: tools.modelEndpoint.endpointId, model: tools.modelEndpoint.model,
          }).execute();
        }
      }
      if (tools.mcpServerIds !== undefined) {
        await trx.deleteFrom("clanker_mcp_servers").where("clanker_id", "=", clankerId).execute();
        const ids = Array.from(new Set(tools.mcpServerIds));
        if (ids.length > 0) {
          await trx
            .insertInto("clanker_mcp_servers")
            .values(ids.map((mcpServerId) => ({ clanker_id: clankerId, mcp_server_id: mcpServerId })))
            .execute();
        }
      }
      if (tools.skillIds !== undefined) {
        await trx.deleteFrom("clanker_skills").where("clanker_id", "=", clankerId).execute();
        const ids = Array.from(new Set(tools.skillIds));
        if (ids.length > 0) {
          await trx.insertInto("clanker_skills").values(ids.map((skillId) => ({ clanker_id: clankerId, skill_id: skillId }))).execute();
        }
      }
    });
  }
}
