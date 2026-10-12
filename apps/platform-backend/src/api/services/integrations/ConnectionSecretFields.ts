import type { IntegrationCredential, PluginField } from "@viberglass/types";
import { IntegrationCredentialDAO } from "../../../persistence/integrations";
import { SecretService } from "../../../services/SecretService";
import { setupSecretLocation } from "../../../services/secretStorageDefaults";

/** A value entered for one of the connection's `secret` fields. */
export interface SecretFieldValue {
  field: PluginField;
  value: string;
}

/**
 * The values of a connection's `secret` config fields. They are kept in the
 * secrets system as the connection's `secret_field` credentials, named by the
 * field's key, so its config never holds them and the browser never sees them.
 */
export class ConnectionSecretFields {
  constructor(
    private readonly credentials: Pick<IntegrationCredentialDAO, "listByIntegrationId" | "create" | "delete"> = new IntegrationCredentialDAO(),
    private readonly secrets: Pick<SecretService, "createSecret" | "updateSecret" | "deleteSecret"> = new SecretService(),
    private readonly location: () => "database" | "ssm" = setupSecretLocation,
  ) {}

  /** The config without its secret fields, and the secret values entered; a blank one keeps what is stored. */
  split(fields: PluginField[], config: Record<string, unknown>): { config: Record<string, unknown>; values: SecretFieldValue[] } {
    const secretFields = fields.filter((field) => field.type === "secret");
    const kept = Object.fromEntries(Object.entries(config).filter(([key]) => !secretFields.some((field) => field.key === key)));
    const values = secretFields.flatMap((field) => {
      const value = config[field.key];
      return typeof value === "string" && value.trim() ? [{ field, value: value.trim() }] : [];
    });
    return { config: kept, values };
  }

  async save(connection: { id: string; name: string }, values: SecretFieldValue[]): Promise<void> {
    if (values.length === 0) return;
    const stored = await this.stored(connection.id);
    for (const { field, value } of values) {
      const existing = stored.find((credential) => credential.name === field.key);
      if (existing) {
        await this.secrets.updateSecret(existing.secretId, { secretValue: value });
        continue;
      }
      const secret = await this.secrets.createSecret({
        name: `${connection.name} ${field.label}`,
        secretLocation: this.location(),
        secretValue: value,
      });
      await this.credentials.create({
        integrationId: connection.id,
        name: field.key,
        credentialType: "secret_field",
        secretId: secret.id,
      });
    }
  }

  /** Deletes the stored values and their secrets, before the connection goes. */
  async removeAll(integrationId: string): Promise<void> {
    for (const credential of await this.stored(integrationId)) {
      await this.credentials.delete(credential.id);
      await this.secrets.deleteSecret(credential.secretId);
    }
  }

  private async stored(integrationId: string): Promise<IntegrationCredential[]> {
    return (await this.credentials.listByIntegrationId(integrationId)).filter(
      (credential) => credential.credentialType === "secret_field",
    );
  }
}
