import { v4 as uuidv4 } from "uuid";
import db from "../config/database";
import { SecretService } from "../../services/SecretService";
import type {
  IntegrationCredential,
  UpdateIntegrationCredentialRequest,
} from "@viberglass/types";
import type { SecretLocation } from "../secret/SecretDAO";

export interface CreateIntegrationCredentialInput {
  integrationId: string;
  name: string;
  credentialType: 'token' | 'ssh_key' | 'oauth' | 'basic';
  secretId: string;
  isDefault?: boolean;
  description?: string | null;
  expiresAt?: string | null;
}

export class IntegrationCredentialDAO {
  private secretService = new SecretService();
  /**
   * Create a new integration credential
   */
  async create(
    input: CreateIntegrationCredentialInput
  ): Promise<IntegrationCredential> {
    const id = uuidv4();
    const timestamp = new Date();

    // If this is marked as default, unset any existing default for this integration
    if (input.isDefault) {
      await this.unsetDefaultForIntegration(input.integrationId);
    }

    const result = await db
      .insertInto("integration_credentials")
      .values({
        id,
        integration_id: input.integrationId,
        name: input.name,
        credential_type: input.credentialType,
        secret_id: input.secretId,
        is_default: input.isDefault ?? false,
        description: input.description ?? null,
        expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToCredential(result);
  }

  /**
   * Get a credential by ID
   */
  async getById(id: string): Promise<IntegrationCredential | null> {
    const row = await db
      .selectFrom("integration_credentials")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToCredential(row);
  }

  /**
   * Get the secret location for a credential
   */
  private async getSecretLocation(secretId: string): Promise<SecretLocation> {
    try {
      const secret = await this.secretService.getSecret(secretId);
      return secret?.secretLocation || 'database';
    } catch {
      return 'database';
    }
  }

  /**
   * List all credentials for an integration
   */
  async listByIntegrationId(
    integrationId: string
  ): Promise<IntegrationCredential[]> {
    const rows = await db
      .selectFrom("integration_credentials")
      .selectAll()
      .where("integration_id", "=", integrationId)
      .orderBy("is_default", "desc")
      .orderBy("created_at", "desc")
      .execute();

    return Promise.all(rows.map((row) => this.mapRowToCredential(row)));
  }

  /**
   * Get the default credential for an integration
   */
  async getDefaultForIntegration(
    integrationId: string
  ): Promise<IntegrationCredential | null> {
    const row = await db
      .selectFrom("integration_credentials")
      .selectAll()
      .where("integration_id", "=", integrationId)
      .where("is_default", "=", true)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToCredential(row);
  }

  /**
   * Update a credential
   */
  async update(
    id: string,
    input: UpdateIntegrationCredentialRequest
  ): Promise<IntegrationCredential | null> {
    const credential = await this.getById(id);
    if (!credential) return null;

    // If setting as default, unset existing default
    if (input.isDefault) {
      await this.unsetDefaultForIntegration(credential.integrationId);
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.expiresAt !== undefined) {
      updateData.expires_at = input.expiresAt ? new Date(input.expiresAt) : null;
    }
    if (input.isDefault !== undefined) {
      updateData.is_default = input.isDefault;
    }

    const result = await db
      .updateTable("integration_credentials")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    if (!result) return null;

    return this.mapRowToCredential(result);
  }

  /**
   * Delete a credential
   */
  async delete(id: string): Promise<boolean> {
    // Check if credential is in use by any project_scm_configs
    const inUseCount = await db
      .selectFrom("project_scm_configs")
      .select((eb) => eb.fn.count("id").as("count"))
      .where("integration_credential_id", "=", id)
      .executeTakeFirst();

    if (Number(inUseCount?.count ?? 0) > 0) {
      throw new Error(
        "Cannot delete credential: it is in use by one or more project SCM configurations"
      );
    }

    const result = await db
      .deleteFrom("integration_credentials")
      .where("id", "=", id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  /**
   * Update last_used_at timestamp
   */
  async updateLastUsed(id: string): Promise<void> {
    await db
      .updateTable("integration_credentials")
      .set({ last_used_at: new Date() })
      .where("id", "=", id)
      .execute();
  }

  /**
   * Delete all credentials for an integration (useful when deleting integration)
   */
  async deleteAllForIntegration(integrationId: string): Promise<number> {
    const result = await db
      .deleteFrom("integration_credentials")
      .where("integration_id", "=", integrationId)
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0);
  }

  private async unsetDefaultForIntegration(integrationId: string): Promise<void> {
    await db
      .updateTable("integration_credentials")
      .set({ is_default: false, updated_at: new Date() })
      .where("integration_id", "=", integrationId)
      .where("is_default", "=", true)
      .execute();
  }

  private async mapRowToCredential(row: Record<string, unknown>): Promise<IntegrationCredential> {
    const secretId = String(row.secret_id);
    const secretLocation = await this.getSecretLocation(secretId);
    
    return {
      id: String(row.id),
      integrationId: String(row.integration_id),
      name: String(row.name),
      credentialType: row.credential_type as IntegrationCredential["credentialType"],
      secretId: secretId,
      secretLocation: secretLocation,
      isDefault: Boolean(row.is_default),
      description: row.description ? String(row.description) : null,
      expiresAt: row.expires_at ? (row.expires_at as Date).toISOString() : null,
      lastUsedAt: row.last_used_at ? (row.last_used_at as Date).toISOString() : null,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }
}
