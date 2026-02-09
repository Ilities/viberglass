import { v4 as uuidv4 } from "uuid";
import db from "../config/database";
import type { Database } from "../types/database";

/**
 * Webhook configuration data access object
 *
 * Manages webhook provider configurations stored in webhook_provider_configs table.
 * Supports per-project configurations with flexible secret storage options.
 */

export type SecretLocation = "database" | "ssm" | "env";
export type WebhookProvider = "github" | "jira" | "shortcut" | "custom";
export type WebhookDirection = "inbound" | "outbound";

/**
 * Webhook configuration as stored in database
 */
export interface WebhookConfig {
  id: string;
  projectId: string | null;
  provider: WebhookProvider;
  direction: WebhookDirection;
  providerProjectId: string | null;
  integrationId: string | null;
  secretLocation: SecretLocation;
  secretPath: string | null;
  webhookSecretEncrypted: string | null;
  apiTokenEncrypted: string | null;
  allowedEvents: string[];
  autoExecute: boolean;
  botUsername: string | null;
  labelMappings: Record<string, unknown>;
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
  direction?: WebhookDirection;
  providerProjectId?: string | null;
  integrationId?: string | null;
  secretLocation?: SecretLocation;
  secretPath?: string | null;
  webhookSecretEncrypted?: string | null;
  apiTokenEncrypted?: string | null;
  allowedEvents?: string[];
  autoExecute?: boolean;
  botUsername?: string | null;
  labelMappings?: Record<string, unknown>;
  active?: boolean;
}

/**
 * DTO for updating an existing webhook configuration
 */
export interface UpdateWebhookConfigDTO {
  projectId?: string | null;
  provider?: WebhookProvider;
  direction?: WebhookDirection;
  providerProjectId?: string | null;
  integrationId?: string | null;
  secretLocation?: SecretLocation;
  secretPath?: string | null;
  webhookSecretEncrypted?: string | null;
  apiTokenEncrypted?: string | null;
  allowedEvents?: string[];
  autoExecute?: boolean;
  botUsername?: string | null;
  labelMappings?: Record<string, unknown>;
  active?: boolean;
}

export class WebhookConfigDAO {
  /**
   * Create a new webhook configuration
   */
  async createConfig(dto: CreateWebhookConfigDTO): Promise<WebhookConfig> {
    const id = uuidv4();
    const timestamp = new Date();

    const result = await db
      .insertInto("webhook_provider_configs")
      .values({
        id,
        project_id: dto.projectId,
        provider: dto.provider,
        direction: dto.direction ?? "inbound",
        provider_project_id: dto.providerProjectId ?? null,
        integration_id: dto.integrationId ?? null,
        secret_location: dto.secretLocation ?? "database",
        secret_path: dto.secretPath ?? null,
        webhook_secret_encrypted: dto.webhookSecretEncrypted ?? null,
        api_token_encrypted: dto.apiTokenEncrypted ?? null,
        allowed_events: JSON.stringify(dto.allowedEvents ?? []) as any, // Kysely jsonb column requires string
        auto_execute: dto.autoExecute ?? false,
        bot_username: dto.botUsername ?? null,
        label_mappings: JSON.stringify(
          dto.labelMappings ?? {},
        ) as any, // Kysely jsonb column requires string
        active: dto.active ?? true,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToConfig(result);
  }

  /**
   * Get webhook configuration by project ID
   */
  async getConfigByProjectId(
    projectId: string,
    direction: WebhookDirection = "inbound",
  ): Promise<WebhookConfig | null> {
    let query = db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("active", "=", true);

    query = query.where("direction", "=", direction as any);

    const row = await query.orderBy("created_at", "desc").executeTakeFirst();

    if (!row) return null;

    return this.mapRowToConfig(row);
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

    if (updates.projectId !== undefined) {
      updateData.project_id = updates.projectId;
    }
    if (updates.provider !== undefined) {
      updateData.provider = updates.provider;
    }
    if (updates.direction !== undefined) {
      updateData.direction = updates.direction;
    }
    if (updates.providerProjectId !== undefined) {
      updateData.provider_project_id = updates.providerProjectId;
    }
    if (updates.integrationId !== undefined) {
      updateData.integration_id = updates.integrationId;
    }
    if (updates.secretLocation !== undefined) {
      updateData.secret_location = updates.secretLocation;
    }
    if (updates.secretPath !== undefined) {
      updateData.secret_path = updates.secretPath;
    }
    if (updates.webhookSecretEncrypted !== undefined) {
      updateData.webhook_secret_encrypted = updates.webhookSecretEncrypted;
    }
    if (updates.apiTokenEncrypted !== undefined) {
      updateData.api_token_encrypted = updates.apiTokenEncrypted;
    }
    if (updates.allowedEvents !== undefined) {
      updateData.allowed_events = JSON.stringify(updates.allowedEvents) as any; // Kysely jsonb column requires string
    }
    if (updates.autoExecute !== undefined) {
      updateData.auto_execute = updates.autoExecute;
    }
    if (updates.botUsername !== undefined) {
      updateData.bot_username = updates.botUsername;
    }
    if (updates.labelMappings !== undefined) {
      updateData.label_mappings = JSON.stringify(
        updates.labelMappings,
      ) as any; // Kysely jsonb column requires string
    }
    if (updates.active !== undefined) {
      updateData.active = updates.active;
    }

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
   * Get webhook configuration by integration ID
   */
  async getByIntegrationId(
    integrationId: string,
    direction?: WebhookDirection,
  ): Promise<WebhookConfig | null> {
    let query = db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("integration_id", "=", integrationId)
      .where("active", "=", true);

    if (direction) {
      query = query.where("direction", "=", direction as any);
    }

    const row = await query.orderBy("created_at", "desc").executeTakeFirst();

    if (!row) return null;

    return this.mapRowToConfig(row);
  }

  /**
   * Get config by integration + config ID with optional direction/active filters.
   * Useful for deterministic instance-scoped API operations.
   */
  async getByIntegrationAndConfigId(
    integrationId: string,
    configId: string,
    options?: { direction?: WebhookDirection; activeOnly?: boolean },
  ): Promise<WebhookConfig | null> {
    let query = db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("integration_id", "=", integrationId)
      .where("id", "=", configId);

    if (options?.activeOnly ?? false) {
      query = query.where("active", "=", true);
    }

    if (options?.direction) {
      query = query.where("direction", "=", options.direction as any);
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
    options?: { direction?: WebhookDirection; activeOnly?: boolean },
  ): Promise<WebhookConfig[]> {
    let query = db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("integration_id", "=", integrationId);

    if (options?.activeOnly ?? true) {
      query = query.where("active", "=", true);
    }

    if (options?.direction) {
      query = query.where("direction", "=", options.direction as any);
    }

    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map((row) => this.mapRowToConfig(row));
  }

  /**
   * Get active configuration by provider and provider project ID
   * Used for webhook routing when project_id is not known initially
   */
  async getActiveConfigByProviderProject(
    provider: WebhookProvider,
    providerProjectId: string,
    direction: WebhookDirection = "inbound",
  ): Promise<WebhookConfig | null> {
    const row = await db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("provider", "=", provider)
      .where("direction", "=", direction as any)
      .where("provider_project_id", "=", providerProjectId)
      .where("active", "=", true)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToConfig(row);
  }

  /**
   * List all configurations for a provider
   */
  async listConfigsByProvider(
    provider: WebhookProvider,
    limit = 50,
    offset = 0,
    direction?: WebhookDirection,
  ): Promise<WebhookConfig[]> {
    let query = db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("provider", "=", provider);

    if (direction) {
      query = query.where("direction", "=", direction as any);
    }

    const rows = await query
      .orderBy("created_at", "desc")
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
    direction?: WebhookDirection,
  ): Promise<WebhookConfig[]> {
    let query = db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("active", "=", true);

    if (direction) {
      query = query.where("direction", "=", direction as any);
    }

    const rows = await query
      .orderBy("created_at", "desc")
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
    direction?: WebhookDirection,
  ): Promise<WebhookConfig[]> {
    let query = db
      .selectFrom("webhook_provider_configs")
      .selectAll()
      .where("project_id", "=", projectId);

    if (direction) {
      query = query.where("direction", "=", direction as any);
    }

    const rows = await query
      .orderBy("created_at", "desc")
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
      direction:
        ((row.direction as WebhookDirection | undefined) ?? "inbound"),
      providerProjectId: row.provider_project_id
        ? String(row.provider_project_id)
        : null,
      integrationId: row.integration_id ? String(row.integration_id) : null,
      secretLocation: row.secret_location as SecretLocation,
      secretPath: row.secret_path ? String(row.secret_path) : null,
      webhookSecretEncrypted: row.webhook_secret_encrypted
        ? String(row.webhook_secret_encrypted)
        : null,
      apiTokenEncrypted: row.api_token_encrypted
        ? String(row.api_token_encrypted)
        : null,
      allowedEvents: row.allowed_events as string[],
      autoExecute: Boolean(row.auto_execute),
      botUsername: row.bot_username ? String(row.bot_username) : null,
      labelMappings:
        typeof row.label_mappings === "string"
          ? JSON.parse(row.label_mappings)
          : (row.label_mappings as Record<string, unknown>),
      active: Boolean(row.active),
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}
