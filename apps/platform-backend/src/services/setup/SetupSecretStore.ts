import { SecretDAO, type SecretLocation } from "../../persistence/secret/SecretDAO";
import { SecretService, type SecretInput, type SecretUpdate } from "../SecretService";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../errors/SetupServiceError";

interface StoredSecret {
  id: string;
  name: string;
  secretLocation: SecretLocation;
}

export interface SecretLookup {
  getSecret(id: string): Promise<StoredSecret | null>;
  getSecretByName(name: string): Promise<StoredSecret | null>;
}

export interface SecretWriter {
  createSecret(input: SecretInput): Promise<{ id: string }>;
  updateSecret(id: string, updates: SecretUpdate): Promise<{ id: string }>;
}

/**
 * Saves what setup collects (model keys, repository tokens) as secrets. New
 * ones are encrypted in the database. Saving again replaces the value where
 * it's stored: an SSM secret stays in SSM (moving it would delete that copy),
 * and one read from the server's environment is refused.
 */
export class SetupSecretStore {
  constructor(
    private readonly lookup: SecretLookup = new SecretDAO(),
    private readonly writer: SecretWriter = new SecretService(),
  ) {}

  /** Creates the secret, or replaces the value of the one with this name. */
  async saveByName(name: string, value: string): Promise<string> {
    const existing = await this.lookup.getSecretByName(name);
    if (existing) return this.replace(existing, value);

    const created = await this.writer.createSecret({
      name,
      secretLocation: "database",
      secretValue: value,
    });
    return created.id;
  }

  /** Replaces the value of an existing secret, found by id. */
  async replaceById(id: string, value: string): Promise<string> {
    const existing = await this.lookup.getSecret(id);
    if (!existing) throw new Error(`Secret ${id} disappeared while saving`);
    return this.replace(existing, value);
  }

  private async replace(secret: StoredSecret, value: string): Promise<string> {
    if (secret.secretLocation === "env") {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.SECRET_MANAGED_ELSEWHERE,
        `${secret.name} is read from the server's environment, so setup can't change it. Update it where the server is configured, or remove that secret under Settings → Secrets.`,
      );
    }
    const updated = await this.writer.updateSecret(secret.id, { secretValue: value });
    return updated.id;
  }
}
