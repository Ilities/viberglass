import { v4 as uuidv4 } from "uuid";
import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import type {
  Clanker,
  ClankerConfigFile,
  CreateClankerRequest,
  UpdateClankerRequest,
  ClankerStatus,
  DeploymentStrategy,
  ConfigFileInput,
  AgentType,
} from "@viberglass/types";
import { DEFAULT_AGENT_TYPE, SUPPORTED_AGENT_TYPES } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import {
  InstructionStorageService,
  InstructionStrategyType,
} from "../../services/instructions/InstructionStorageService";
import {
  normalizeInstructionPath,
} from "../../services/instructions/pathPolicy";
import { validateClankerConfigFiles } from "../../services/clanker-config-files/nativeAgentConfig";

type ClankersRow = Selectable<Database["clankers"]>;
type ClankerConfigFilesRow = Selectable<Database["clanker_config_files"]>;

const logger = createChildLogger({ dao: "ClankerDAO" });
const validAgentTypeSet = new Set<string>(SUPPORTED_AGENT_TYPES);

function isValidAgentType(value: unknown): value is AgentType {
  return typeof value === "string" && validAgentTypeSet.has(value);
}

// Joined query result type with aliased columns from deployment_strategies
type ClankerWithStrategyRow = ClankersRow & {
  strategy_id: string | null;
  strategy_name: string | null;
  strategy_description: string | null;
  strategy_config_schema: unknown;
  strategy_created_at: Date | null;
};

const slugify = (text: string) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");

function normalizeStrategyName(name: string | null | undefined): InstructionStrategyType {
  const normalized = (name || "").toLowerCase();
  if (normalized === "ecs") {
    return "ecs";
  }
  if (normalized === "lambda" || normalized === "aws-lambda-container") {
    return "lambda";
  }

  return "docker";
}

function readStrategyTypeFromConfig(config: unknown): InstructionStrategyType | null {
  if (!config) {
    return null;
  }

  let parsed = config;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const strategy = (parsed as { strategy?: { type?: unknown } }).strategy;
  if (!strategy || typeof strategy.type !== "string") {
    return null;
  }

  if (strategy.type === "ecs") {
    return "ecs";
  }

  if (strategy.type === "lambda") {
    return "lambda";
  }

  return "docker";
}

export class ClankerDAO {
  private readonly instructionStorage = new InstructionStorageService();

  async createClanker(request: CreateClankerRequest): Promise<Clanker> {
    const clankerId = uuidv4();
    const timestamp = new Date();
    const slug = slugify(request.name);

    await db
      .insertInto("clankers")
      .values({
        id: clankerId,
        name: request.name,
        slug,
        description: request.description || null,
        deployment_strategy_id: request.deploymentStrategyId || null,
        deployment_config: request.deploymentConfig
          ? JSON.stringify(request.deploymentConfig)
          : null,
        agent: request.agent || DEFAULT_AGENT_TYPE,
        secret_ids: JSON.stringify(request.secretIds || []),
        status: "inactive",
        status_message: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();

    if (request.configFiles && request.configFiles.length > 0) {
      const strategyType = await this.resolveClankerStrategyType(clankerId);
      await this.upsertConfigFiles(
        clankerId,
        request.configFiles,
        strategyType,
        request.agent ?? DEFAULT_AGENT_TYPE,
      );
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

    if (updates.configFiles !== undefined) {
      const strategyType = await this.resolveClankerStrategyType(id);
      const currentClanker = await this.getClanker(id);
      await this.upsertConfigFiles(
        id,
        updates.configFiles,
        strategyType,
        updates.agent ?? currentClanker?.agent ?? DEFAULT_AGENT_TYPE,
      );
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
      .orderBy("clankers.name", "asc")
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
    const existing = await db
      .selectFrom("clanker_config_files")
      .selectAll()
      .where("clanker_id", "=", id)
      .execute();

    for (const file of existing) {
      if (file.storage_url) {
        await this.instructionStorage.deleteInstruction(file.storage_url);
      }
    }

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
        status,
        status_message: statusMessage ?? null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();

    return this.getClanker(id) as Promise<Clanker>;
  }

  async getConfigFiles(clankerId: string): Promise<ClankerConfigFile[]> {
    const rows = await db
      .selectFrom("clanker_config_files")
      .selectAll()
      .where("clanker_id", "=", clankerId)
      .orderBy("file_type", "asc")
      .execute();

    const files: ClankerConfigFile[] = [];
    for (const row of rows) {
      files.push(await this.mapRowToConfigFile(row));
    }

    return files;
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
    strategyType: InstructionStrategyType,
    agent: AgentType | null | undefined,
  ): Promise<void> {
    const existingRows = await db
      .selectFrom("clanker_config_files")
      .selectAll()
      .where("clanker_id", "=", clankerId)
      .execute();

    const existingByPath = new Map(
      existingRows.map((row) => [row.file_type.toLowerCase(), row]),
    );
    const nextByPath = new Map<string, ConfigFileInput>();
    const validatedConfigFiles = validateClankerConfigFiles(
      agent,
      configFiles,
    );

    for (const file of [
      ...validatedConfigFiles.instructionFiles,
      ...(validatedConfigFiles.nativeAgentConfigFile
        ? [validatedConfigFiles.nativeAgentConfigFile]
        : []),
    ]) {
      const fileType = normalizeInstructionPath(file.fileType);
      const content = typeof file.content === "string" ? file.content : "";
      if (!content.trim()) {
        continue;
      }

      nextByPath.set(fileType.toLowerCase(), {
        fileType,
        content,
      });
    }

    for (const [key, row] of existingByPath.entries()) {
      if (nextByPath.has(key)) {
        continue;
      }

      await db
        .deleteFrom("clanker_config_files")
        .where("clanker_id", "=", clankerId)
        .where("file_type", "=", row.file_type)
        .execute();

      if (row.storage_url) {
        await this.instructionStorage.deleteInstruction(row.storage_url);
      }
    }

    for (const [key, file] of nextByPath.entries()) {
      const existing = existingByPath.get(key);
      const storageUrl = await this.instructionStorage.storeClankerInstruction(
        clankerId,
        file.fileType,
        file.content,
        strategyType,
      );

      if (existing) {
        await db
          .updateTable("clanker_config_files")
          .set({
            content: file.content,
            storage_url: storageUrl,
            updated_at: new Date(),
          })
          .where("clanker_id", "=", clankerId)
          .where("file_type", "=", existing.file_type)
          .execute();

        if (existing.storage_url && existing.storage_url !== storageUrl) {
          await this.instructionStorage.deleteInstruction(existing.storage_url);
        }
      } else {
        await db
          .insertInto("clanker_config_files")
          .values({
            id: uuidv4(),
            clanker_id: clankerId,
            file_type: file.fileType,
            content: file.content,
            storage_url: storageUrl,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .execute();
      }
    }
  }

  async deleteConfigFile(clankerId: string, fileType: string): Promise<void> {
    const existing = await db
      .selectFrom("clanker_config_files")
      .selectAll()
      .where("clanker_id", "=", clankerId)
      .where("file_type", "=", fileType)
      .executeTakeFirst();

    await db
      .deleteFrom("clanker_config_files")
      .where("clanker_id", "=", clankerId)
      .where("file_type", "=", fileType)
      .execute();

    if (existing?.storage_url) {
      await this.instructionStorage.deleteInstruction(existing.storage_url);
    }
  }

  private mapRowToClanker(
    row: ClankerWithStrategyRow,
    configFiles: ClankerConfigFile[],
  ): Clanker {
    const deploymentStrategy: DeploymentStrategy | null = row.strategy_id
      ? {
          id: row.strategy_id,
          name: row.strategy_name ?? "",
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
              : (row.strategy_created_at ?? new Date().toISOString()),
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
      agent: isValidAgentType(row.agent) ? row.agent : null,
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

  private async mapRowToConfigFile(
    row: ClankerConfigFilesRow,
  ): Promise<ClankerConfigFile> {
    if (!row.storage_url) {
      throw new Error(
        `Instruction storage URL missing for clanker config file ${row.file_type}`,
      );
    }

    const content = await this.instructionStorage
      .readInstruction(row.storage_url)
      .catch((error) => {
        logger.error("Failed to read clanker instruction file", {
          clankerId: row.clanker_id,
          fileType: row.file_type,
          storageUrl: row.storage_url,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });

    return {
      id: row.id,
      clankerId: row.clanker_id,
      fileType: row.file_type,
      content,
      storageUrl: row.storage_url,
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

  private async resolveClankerStrategyType(
    clankerId: string,
  ): Promise<InstructionStrategyType> {
    const row = await db
      .selectFrom("clankers")
      .leftJoin(
        "deployment_strategies",
        "deployment_strategies.id",
        "clankers.deployment_strategy_id",
      )
      .select([
        "clankers.deployment_config",
        "deployment_strategies.name as strategy_name",
      ])
      .where("clankers.id", "=", clankerId)
      .executeTakeFirst();

    if (!row) {
      throw new Error(`Clanker not found: ${clankerId}`);
    }

    return (
      readStrategyTypeFromConfig(row.deployment_config) ||
      normalizeStrategyName(row.strategy_name)
    );
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
