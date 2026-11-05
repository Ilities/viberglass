import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";

type AppSettingRow = Selectable<Database["app_settings"]>;

/** A setting as stored: a plain value, or the id of the secret that holds it. */
export interface AppSettingRecord {
  projectId: string;
  name: string;
  value: string | null;
  secretId: string | null;
  forPreviews: boolean;
  updatedAt: Date;
}

export interface AppSettingWrite {
  value: string | null;
  secretId: string | null;
  forPreviews: boolean;
  updatedBy: string | null;
}

export class AppSettingDAO {
  async list(projectId: string): Promise<AppSettingRecord[]> {
    const rows = await db.selectFrom("app_settings").selectAll().where("project_id", "=", projectId).orderBy("name").execute();
    return rows.map(toSetting);
  }

  async get(projectId: string, name: string): Promise<AppSettingRecord | null> {
    const row = await db.selectFrom("app_settings").selectAll().where("project_id", "=", projectId).where("name", "=", name).executeTakeFirst();
    return row ? toSetting(row) : null;
  }

  async put(projectId: string, name: string, write: AppSettingWrite): Promise<void> {
    const columns = { value: write.value, secret_id: write.secretId, for_previews: write.forPreviews, updated_by: write.updatedBy, updated_at: new Date() };
    await db
      .insertInto("app_settings")
      .values({ project_id: projectId, name, ...columns })
      .onConflict((conflict) => conflict.columns(["project_id", "name"]).doUpdateSet(columns))
      .execute();
  }

  async delete(projectId: string, name: string): Promise<void> {
    await db.deleteFrom("app_settings").where("project_id", "=", projectId).where("name", "=", name).execute();
  }
}

function toSetting(row: AppSettingRow): AppSettingRecord {
  return {
    projectId: row.project_id,
    name: row.name,
    value: row.value,
    secretId: row.secret_id,
    forPreviews: row.for_previews,
    updatedAt: row.updated_at,
  };
}
