import db from "../config/database";

/** The newest active connection of an integration, and a stamp that changes with it, its credentials or their secrets. */
export interface ConnectionVersion {
  id: string;
  version: string;
}

export class ConnectionVersionDAO {
  async newestActive(system: string): Promise<ConnectionVersion | null> {
    const row = await db
      .selectFrom("integrations as integration")
      .leftJoin("integration_credentials as credential", "credential.integration_id", "integration.id")
      .leftJoin("secrets as secret", "secret.id", "credential.secret_id")
      .select(["integration.id", "integration.updated_at as updatedAt"])
      .select((eb) => [
        eb.fn.count("credential.id").as("credentials"),
        eb.fn.max("credential.updated_at").as("credentialsAt"),
        eb.fn.max("secret.updated_at").as("secretsAt"),
      ])
      .where("integration.system", "=", system)
      .where("integration.is_active", "=", true)
      .groupBy(["integration.id", "integration.updated_at", "integration.created_at"])
      .orderBy("integration.created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    if (!row) return null;
    return { id: row.id, version: JSON.stringify([row.id, row.updatedAt, row.credentials, row.credentialsAt, row.secretsAt]) };
  }
}
