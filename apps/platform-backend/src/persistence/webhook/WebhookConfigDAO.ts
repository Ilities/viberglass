import { randomUUID } from "crypto";
import { sql } from "kysely";
import db from "../config/database";

/**
 * Webhook configuration data access object
 *
 * Manages webhook provider configurations stored in webhook_provider_configs table.
 * Supports per-project configurations with flexible secret storage options.
 */

export type SecretLocation = "database" | "ssm" | "env";
export type WebhookProvider = "github" | "jira" | "shortcut" | "custom";

/**
 * Webhook configuration as stored in database
 */
export interface WebhookConfig {
  id: string;
  projectId: string | null;
  provider: WebhookProvider;
  integrationId: string | null;
  secretLocation: SecretLocation;
  secretPath: string | null;
  webhookSecretEncrypted: string | null;
  allowedEvents: string[];
  planNewIssues: boolean;
  botUsername: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for creating a new webhook configuration
 */
export interface CreateWebhookConfigDTO {
  projectId: string | null;
  provider: WebhookProvider;
  integrationId?: string | null;
  secretLocation?: SecretLocation;
  secretPath?: string | null;
  webhookSecretEncrypted?: string | null;
  allowedEvents?: string[];
  planNewIssues?: boolean;
  botUsername?: string | null;
  active?: boolean;
}

/**
 * DTO for updating an existing webhook configuration
 */
export interface UpdateWebhookConfigDTO {
  projectId?: string | null;
  provider?: WebhookProvider;
  integrationId?: string | null;
  secretLocation?: SecretLocation;
  secretPath?: string | null;
  webhookSecretEncrypted?: string | null;
  allowedEvents?: string[];
  planNewIssues?: boolean;
  botUsername?: string | null;
  active?: boolean;
}

export class WebhookConfigDAO {
  /**
   * Create a new webhook configuration
   */
  async createConfig(dto: CreateWebhookConfigDTO): Promise<WebhookConfig> {
    const id = randomUUID();
    const timestamp = new Date();

    const result = await db
      .insertInto("webhook_provider_configs")
      .values({
        id,
        project_id: dto.projectId,
        provider: dto.provider,
        integration_id: dto.integrationId ?? null,
        secret_location: dto.secretLocation ?? "database",
        secret_path: dto.secretPath ?? null,
        webhook_secret_encrypted: dto.webhookSecretEncrypted ?? null,
        allowed_events: sql<string[]>`${JSON.stringify(dto.allowedEvents ?? [])}::jsonb`,
        plan_new_issues: dto.planNewIssues ?? false,
        bot_username: dto.botUsername ?? null,
        active: dto.active ?? true,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToConfig(result);
  }

  /**
   * Get webhook configuration by ID
   */
  async getConfigById(id: string): Promise<WebhookConfig | null> {
    const row = await db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToConfig(row);
  }

  /**
   * Update webhook configuration
   */
  async updateConfig(id: string, updates: UpdateWebhookConfigDTO): Promise<void> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.projectId !== undefined) updateData.project_id = updates.projectId;
    if (updates.provider !== undefined) updateData.provider = updates.provider;
    if (updates.integrationId !== undefined) updateData.integration_id = updates.integrationId;
    if (updates.secretLocation !== undefined) updateData.secret_location = updates.secretLocation;
    if (updates.secretPath !== undefined) updateData.secret_path = updates.secretPath;
    if (updates.webhookSecretEncrypted !== undefined) updateData.webhook_secret_encrypted = updates.webhookSecretEncrypted;
    if (updates.allowedEvents !== undefined) {
      updateData.allowed_events = sql<string[]>`${JSON.stringify(updates.allowedEvents)}::jsonb`;
    }
    if (updates.planNewIssues !== undefined) updateData.plan_new_issues = updates.planNewIssues;
    if (updates.botUsername !== undefined) updateData.bot_username = updates.botUsername;
    if (updates.active !== undefined) updateData.active = updates.active;

    await db
      .updateTable("webhook_provider_configs")
      .set(updateData)
      .where("id", "=", id)
      .execute();
  }

  /**
   * Delete webhook configuration
   */
  async deleteConfig(id: string): Promise<boolean> {
    const result = await db
      .deleteFrom("webhook_provider_configs")
      .where("id", "=", id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  /**
   * Delete all webhook configurations for an integration
   */
  async deleteAllForIntegration(integrationId: string): Promise<number> {
    const result = await db
      .deleteFrom("webhook_provider_configs")
      .where("integration_id", "=", integrationId)
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0);
  }

  /**
   * Get config by integration + config ID, optionally active only.
   * Useful for deterministic instance-scoped API operations.
   */
  async getByIntegrationAndConfigId(
    integrationId: string,
    configId: string,
    options?: { activeOnly?: boolean },
  ): Promise<WebhookConfig | null> {
    let query = db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("integration_id", "=", integrationId)
      .where("id", "=", configId);

    if (options?.activeOnly ?? false) {
      query = query.where("active", "=", true);
    }

    const row = await query.executeTakeFirst();
    if (!row) return null;

    return this.mapRowToConfig(row);
  }

  /**
   * List webhook configurations by integration ID
   */
  async listByIntegrationId(
    integrationId: string,
    options?: { activeOnly?: boolean },
  ): Promise<WebhookConfig[]> {
    let query = db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("integration_id", "=", integrationId);

    if (options?.activeOnly ?? true) {
      query = query.where("active", "=", true);
    }

    const rows = await query
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();
    return rows.map((row) => this.mapRowToConfig(row));
  }

  /**
   * List all configurations for a provider
   */
  async listConfigsByProvider(
    provider: WebhookProvider,
    limit = 50,
    offset = 0,
  ): Promise<WebhookConfig[]> {
    const rows = await db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("provider", "=", provider)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRowToConfig(row));
  }

  /**
   * List all active configurations
   */
  async listActiveConfigs(
    limit = 50,
    offset = 0,
  ): Promise<WebhookConfig[]> {
    const rows = await db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("active", "=", true)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRowToConfig(row));
  }

  /**
   * List configurations for a specific project
   */
  async listConfigsByProject(
    projectId: string,
    limit = 50,
    offset = 0,
  ): Promise<WebhookConfig[]> {
    const rows = await db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("project_id", "=", projectId)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRowToConfig(row));
  }

  private mapRowToConfig(row: Record<string, unknown>): WebhookConfig {
    return {
      id: String(row.id),
      projectId: row.project_id ? String(row.project_id) : null,
      provider: row.provider as WebhookProvider,
      integrationId: row.integration_id ? String(row.integration_id) : null,
      secretLocation: row.secret_location as SecretLocation,
      secretPath: row.secret_path ? String(row.secret_path) : null,
      webhookSecretEncrypted: row.webhook_secret_encrypted
        ? String(row.webhook_secret_encrypted)
        : null,
      allowedEvents: row.allowed_events as string[],
      planNewIssues: Boolean(row.plan_new_issues),
      botUsername: row.bot_username ? String(row.bot_username) : null,
      active: Boolean(row.active),
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}
