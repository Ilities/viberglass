import db from "../config/database";

export interface ExpiringCredential {
  id: string;
  name: string;
  integrationId: string;
  integrationName: string;
  expiresAt: Date;
}

/** Connection credentials about to expire that admins haven't been warned about. */
export class CredentialExpiryDAO {
  async listUnwarnedExpiringBefore(before: Date, now: Date): Promise<ExpiringCredential[]> {
    const rows = await db
      .selectFrom("integration_credentials as c")
      .innerJoin("integrations as i", "i.id", "c.integration_id")
      .select(["c.id", "c.name", "c.integration_id", "c.expires_at", "i.name as integration_name"])
      .where("c.expires_at", "is not", null)
      .where("c.expires_at", ">", now)
      .where("c.expires_at", "<=", before)
      .where("c.expiry_warned_at", "is", null)
      .execute();
    return rows.flatMap((row) =>
      row.expires_at
        ? [{ id: row.id, name: row.name, integrationId: row.integration_id, integrationName: row.integration_name, expiresAt: row.expires_at }]
        : [],
    );
  }

  async markWarned(id: string): Promise<void> {
    await db.updateTable("integration_credentials").set({ expiry_warned_at: new Date() }).where("id", "=", id).execute();
  }
}
