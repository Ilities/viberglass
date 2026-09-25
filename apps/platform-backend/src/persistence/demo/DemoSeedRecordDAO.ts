import db from "../config/database";

export type DemoEntityType = "user" | "project" | "clanker" | "job";

export interface DemoSeedRecord {
  entityType: DemoEntityType;
  entityId: string;
}

/** What the demo workspace created, so it can be removed exactly. */
export class DemoSeedRecordDAO {
  async record(entityType: DemoEntityType, entityId: string): Promise<void> {
    await db.insertInto("demo_seed_records").values({ entity_type: entityType, entity_id: entityId }).execute();
  }

  async list(): Promise<DemoSeedRecord[]> {
    const rows = await db.selectFrom("demo_seed_records").select(["entity_type", "entity_id"]).execute();
    return rows.map((row) => ({ entityType: row.entity_type, entityId: row.entity_id }));
  }

  async clear(): Promise<void> {
    await db.deleteFrom("demo_seed_records").execute();
  }
}
