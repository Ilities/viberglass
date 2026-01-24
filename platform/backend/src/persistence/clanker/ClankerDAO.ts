import { v4 as uuidv4 } from "uuid";
import db from "../config/database";
import type {
  Clanker,
  ClankerConfigFile,
  CreateClankerRequest,
  UpdateClankerRequest,
  ClankerStatus,
  DeploymentStrategy,
  ConfigFileInput,
} from "@viberglass/types";

const slugify = (text: string) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");

export class ClankerDAO {
  async createClanker(request: CreateClankerRequest): Promise<Clanker> {
    const clankerId = uuidv4();
    const timestamp = new Date();
    const slug = slugify(request.name);

    // Insert the clanker
    await db
      .insertInto("clankers")
      .values({
        id: clankerId,
        name: request.name,
        slug: slug,
        description: request.description || null,
        deployment_strategy_id: request.deploymentStrategyId || null,
        deployment_config: request.deploymentConfig
          ? JSON.stringify(request.deploymentConfig)
          : null,
        agent: request.agent || "claude-code",
        secret_ids: JSON.stringify(request.secretIds || []),
        status: "inactive",
        status_message: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();

    // Insert config files if provided
    if (request.configFiles && request.configFiles.length > 0) {
      await this.upsertConfigFiles(clankerId, request.configFiles);
    }

    return this.getClanker(clankerId) as Promise<Clanker>;
  }

  async getClanker(id: string): Promise<Clanker | null> {
    const row = await db
      .selectFrom("clankers")
      .leftJoin(
        "deployment_strategies",
        "deployment_strategies.id",
        "clankers.deployment_strategy_id",
      )
      .select([
        "clankers.id",
        "clankers.name",
        "clankers.slug",
        "clankers.description",
        "clankers.deployment_strategy_id",
        "clankers.deployment_config",
        "clankers.agent",
        "clankers.secret_ids",
        "clankers.status",
        "clankers.status_message",
        "clankers.created_at",
        "clankers.updated_at",
        "deployment_strategies.id as strategy_id",
        "deployment_strategies.name as strategy_name",
        "deployment_strategies.description as strategy_description",
        "deployment_strategies.config_schema as strategy_config_schema",
        "deployment_strategies.created_at as strategy_created_at",
      ])
      .where("clankers.id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    const configFiles = await this.getConfigFiles(id);

    return this.mapRowToClanker(row, configFiles);
  }

  async getClankerBySlug(slug: string): Promise<Clanker | null> {
    const row = await db
      .selectFrom("clankers")
      .leftJoin(
        "deployment_strategies",
        "deployment_strategies.id",
        "clankers.deployment_strategy_id",
      )
      .select([
        "clankers.id",
        "clankers.name",
        "clankers.slug",
        "clankers.description",
        "clankers.deployment_strategy_id",
        "clankers.deployment_config",
        "clankers.agent",
        "clankers.secret_ids",
        "clankers.status",
        "clankers.status_message",
        "clankers.created_at",
        "clankers.updated_at",
        "deployment_strategies.id as strategy_id",
        "deployment_strategies.name as strategy_name",
        "deployment_strategies.description as strategy_description",
        "deployment_strategies.config_schema as strategy_config_schema",
        "deployment_strategies.created_at as strategy_created_at",
      ])
      .where("clankers.slug", "=", slug)
      .executeTakeFirst();

    if (!row) return null;

    const configFiles = await this.getConfigFiles(row.id);

    return this.mapRowToClanker(row, configFiles);
  }

  async updateClanker(
    id: string,
    updates: UpdateClankerRequest,
  ): Promise<Clanker> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) {
      updateData.name = updates.name;
      updateData.slug = slugify(updates.name);
    }
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.deploymentStrategyId !== undefined)
      updateData.deployment_strategy_id = updates.deploymentStrategyId;
    if (updates.deploymentConfig !== undefined)
      updateData.deployment_config = updates.deploymentConfig
        ? JSON.stringify(updates.deploymentConfig)
        : null;
    if (updates.agent !== undefined) updateData.agent = updates.agent;
    if (updates.secretIds !== undefined)
      updateData.secret_ids = JSON.stringify(updates.secretIds);
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.statusMessage !== undefined)
      updateData.status_message = updates.statusMessage;

    await db
      .updateTable("clankers")
      .set(updateData)
      .where("id", "=", id)
      .execute();

    // Update config files if provided
    if (updates.configFiles !== undefined) {
      await this.upsertConfigFiles(id, updates.configFiles);
    }

    return this.getClanker(id) as Promise<Clanker>;
  }

  async listClankers(limit = 50, offset = 0): Promise<Clanker[]> {
    const rows = await db
      .selectFrom("clankers")
      .leftJoin(
        "deployment_strategies",
        "deployment_strategies.id",
        "clankers.deployment_strategy_id",
      )
      .select([
        "clankers.id",
        "clankers.name",
        "clankers.slug",
        "clankers.description",
        "clankers.deployment_strategy_id",
        "clankers.deployment_config",
        "clankers.agent",
        "clankers.secret_ids",
        "clankers.status",
        "clankers.status_message",
        "clankers.created_at",
        "clankers.updated_at",
        "deployment_strategies.id as strategy_id",
        "deployment_strategies.name as strategy_name",
        "deployment_strategies.description as strategy_description",
        "deployment_strategies.config_schema as strategy_config_schema",
        "deployment_strategies.created_at as strategy_created_at",
      ])
      .orderBy("clankers.created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    const clankers: Clanker[] = [];
    for (const row of rows) {
      const configFiles = await this.getConfigFiles(row.id);
      clankers.push(this.mapRowToClanker(row, configFiles));
    }

    return clankers;
  }

  async deleteClanker(id: string): Promise<void> {
    // Config files are deleted automatically via cascade
    await db.deleteFrom("clankers").where("id", "=", id).execute();
  }

  async updateStatus(
    id: string,
    status: ClankerStatus,
    statusMessage?: string | null,
  ): Promise<Clanker> {
    await db
      .updateTable("clankers")
      .set({
        status: status,
        status_message: statusMessage ?? null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();

    return this.getClanker(id) as Promise<Clanker>;
  }

  // Config file methods
  async getConfigFiles(clankerId: string): Promise<ClankerConfigFile[]> {
    const rows = await db
      .selectFrom("clanker_config_files")
      .selectAll()
      .where("clanker_id", "=", clankerId)
      .orderBy("file_type", "asc")
      .execute();

    return rows.map((row) => this.mapRowToConfigFile(row));
  }

  async getConfigFile(
    clankerId: string,
    fileType: string,
  ): Promise<ClankerConfigFile | null> {
    const row = await db
      .selectFrom("clanker_config_files")
      .selectAll()
      .where("clanker_id", "=", clankerId)
      .where("file_type", "=", fileType)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToConfigFile(row);
  }

  async upsertConfigFiles(
    clankerId: string,
    configFiles: ConfigFileInput[],
  ): Promise<void> {
    // Delete existing config files not in the new list
    const newFileTypes = configFiles.map((f) => f.fileType);

    if (newFileTypes.length > 0) {
      await db
        .deleteFrom("clanker_config_files")
        .where("clanker_id", "=", clankerId)
        .where("file_type", "not in", newFileTypes)
        .execute();
    } else {
      // If no new files, delete all existing
      await db
        .deleteFrom("clanker_config_files")
        .where("clanker_id", "=", clankerId)
        .execute();
    }

    // Upsert each config file
    for (const file of configFiles) {
      if (!file.content || file.content.trim() === "") {
        // Delete if content is empty
        await db
          .deleteFrom("clanker_config_files")
          .where("clanker_id", "=", clankerId)
          .where("file_type", "=", file.fileType)
          .execute();
      } else {
        const existing = await this.getConfigFile(clankerId, file.fileType);
        if (existing) {
          await db
            .updateTable("clanker_config_files")
            .set({
              content: file.content,
              updated_at: new Date(),
            })
            .where("clanker_id", "=", clankerId)
            .where("file_type", "=", file.fileType)
            .execute();
        } else {
          await db
            .insertInto("clanker_config_files")
            .values({
              id: uuidv4(),
              clanker_id: clankerId,
              file_type: file.fileType,
              content: file.content,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .execute();
        }
      }
    }
  }

  async deleteConfigFile(clankerId: string, fileType: string): Promise<void> {
    await db
      .deleteFrom("clanker_config_files")
      .where("clanker_id", "=", clankerId)
      .where("file_type", "=", fileType)
      .execute();
  }

  private mapRowToClanker(row: any, configFiles: ClankerConfigFile[]): Clanker {
    const deploymentStrategy: DeploymentStrategy | null = row.strategy_id
      ? {
          id: row.strategy_id,
          name: row.strategy_name,
          description: row.strategy_description || null,
          configSchema:
            row.strategy_config_schema != null
              ? typeof row.strategy_config_schema === "string"
                ? JSON.parse(row.strategy_config_schema)
                : row.strategy_config_schema
              : null,
          createdAt:
            row.strategy_created_at instanceof Date
              ? row.strategy_created_at.toISOString()
              : row.strategy_created_at,
        }
      : null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || null,
      deploymentStrategyId: row.deployment_strategy_id || null,
      deploymentStrategy,
      deploymentConfig:
        row.deployment_config != null
          ? typeof row.deployment_config === "string"
            ? JSON.parse(row.deployment_config)
            : row.deployment_config
          : null,
      configFiles,
      agent: row.agent || null,
      secretIds:
        row.secret_ids != null
          ? typeof row.secret_ids === "string"
            ? JSON.parse(row.secret_ids)
            : row.secret_ids
          : [],
      status: row.status,
      statusMessage: row.status_message || null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    };
  }

  private mapRowToConfigFile(row: any): ClankerConfigFile {
    return {
      id: row.id,
      clankerId: row.clanker_id,
      fileType: row.file_type,
      content: row.content,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    };
  }

  // Validation methods
  validateSecretIds(secretIds: string[]): void {
    if (!Array.isArray(secretIds)) {
      throw new Error("secretIds must be an array");
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of secretIds) {
      if (!uuidRegex.test(id)) {
        throw new Error(`Invalid secret ID format: ${id}`);
      }
    }
  }

  async validateSecretsExist(secretIds: string[]): Promise<void> {
    if (secretIds.length === 0) return;

    this.validateSecretIds(secretIds);

    const secrets = await db
      .selectFrom("secrets")
      .select("id")
      .where("id", "in", secretIds)
      .execute();

    if (secrets.length !== secretIds.length) {
      const found = secrets.map((s) => s.id);
      const missing = secretIds.filter((id) => !found.includes(id));
      throw new Error(`Secrets not found: ${missing.join(", ")}`);
    }
  }
}
