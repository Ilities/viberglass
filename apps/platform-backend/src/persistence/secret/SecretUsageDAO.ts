import type { SecretUse } from "@viberglass/types";
import db from "../config/database";

/** Finds what reads each secret besides agents, so nobody deletes a secret that looks unused. */
export class SecretUsageDAO {
  async listUses(): Promise<SecretUse[]> {
    const [spaces, connections, endpoints] = await Promise.all([
      this.spaceUses(),
      this.connectionUses(),
      this.endpointUses(),
    ]);
    return [...spaces, ...connections, ...endpoints];
  }

  /** A space reads its repository token directly, or through one of its connection's credentials. */
  private async spaceUses(): Promise<SecretUse[]> {
    const rows = await db
      .selectFrom("project_scm_configs as config")
      .innerJoin("projects as project", "project.id", "config.project_id")
      .leftJoin(
        "integration_credentials as credential",
        "credential.id",
        "config.integration_credential_id",
      )
      .select([
        "project.name as name",
        "config.credential_secret_id as directSecretId",
        "credential.secret_id as credentialSecretId",
      ])
      .execute();

    return rows.flatMap((row) =>
      [...new Set([row.directSecretId, row.credentialSecretId])]
        .filter((secretId): secretId is string => Boolean(secretId))
        .map((secretId): SecretUse => ({ secretId, kind: "space", name: row.name })),
    );
  }

  private async connectionUses(): Promise<SecretUse[]> {
    const rows = await db
      .selectFrom("integration_credentials as credential")
      .innerJoin("integrations as integration", "integration.id", "credential.integration_id")
      .select(["integration.name as name", "credential.secret_id as secretId"])
      .execute();

    return rows.map((row): SecretUse => ({ secretId: row.secretId, kind: "connection", name: row.name }));
  }

  private async endpointUses(): Promise<SecretUse[]> {
    const rows = await db
      .selectFrom("model_endpoints")
      .select(["name", "secret_id as secretId"])
      .where("secret_id", "is not", null)
      .execute();

    return rows.flatMap((row): SecretUse[] =>
      row.secretId ? [{ secretId: row.secretId, kind: "model_endpoint", name: row.name }] : [],
    );
  }
}
