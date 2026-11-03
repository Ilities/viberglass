import type { AppHome } from "@viberglass/types";
import db from "../config/database";

export class WorkspaceSettingsDAO {
  /** Null until an admin sets one, or after its connection is deleted. */
  async getAppHome(): Promise<AppHome | null> {
    const row = await db
      .selectFrom("workspace_settings")
      .select(["app_home_integration_id", "app_home_credential_id", "app_home_owner"])
      .executeTakeFirst();
    if (!row?.app_home_integration_id || !row.app_home_owner) return null;
    return {
      integrationId: row.app_home_integration_id,
      credentialId: row.app_home_credential_id,
      owner: row.app_home_owner,
    };
  }

  async setAppHome(home: AppHome | null, updatedBy: string | null): Promise<void> {
    const values = {
      app_home_integration_id: home?.integrationId ?? null,
      app_home_credential_id: home?.credentialId ?? null,
      app_home_owner: home?.owner ?? null,
      updated_by: updatedBy,
      updated_at: new Date(),
    };
    await db
      .insertInto("workspace_settings")
      .values(values)
      .onConflict((conflict) => conflict.column("id").doUpdateSet(values))
      .execute();
  }
}
