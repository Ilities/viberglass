import { v4 as uuidv4 } from "uuid";
import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import type {
  DeploymentStrategy,
  CreateDeploymentStrategyRequest,
  UpdateDeploymentStrategyRequest,
} from "@viberglass/types";

type DeploymentStrategiesRow = Selectable<Database["deployment_strategies"]>;

export class DeploymentStrategyDAO {
  async createDeploymentStrategy(
    request: CreateDeploymentStrategyRequest,
  ): Promise<DeploymentStrategy> {
    const id = uuidv4();
    const timestamp = new Date();

    const result = await db
      .insertInto("deployment_strategies")
      .values({
        id,
        name: request.name,
        description: request.description || null,
        config_schema: request.configSchema
          ? JSON.stringify(request.configSchema)
          : null,
        created_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToDeploymentStrategy(result);
  }

  async getDeploymentStrategy(id: string): Promise<DeploymentStrategy | null> {
    const row = await db
      .selectFrom("deployment_strategies")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToDeploymentStrategy(row);
  }

  async getDeploymentStrategyByName(
    name: string,
  ): Promise<DeploymentStrategy | null> {
    const row = await db
      .selectFrom("deployment_strategies")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToDeploymentStrategy(row);
  }

  async updateDeploymentStrategy(
    id: string,
    updates: UpdateDeploymentStrategyRequest,
  ): Promise<DeploymentStrategy> {
    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.configSchema !== undefined)
      updateData.config_schema = updates.configSchema
        ? JSON.stringify(updates.configSchema)
        : null;

    const result = await db
      .updateTable("deployment_strategies")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToDeploymentStrategy(result);
  }

  async listDeploymentStrategies(): Promise<DeploymentStrategy[]> {
    const rows = await db
      .selectFrom("deployment_strategies")
      .selectAll()
      .orderBy("name", "asc")
      .execute();

    return rows.map((row) => this.mapRowToDeploymentStrategy(row));
  }

  async deleteDeploymentStrategy(id: string): Promise<void> {
    await db.deleteFrom("deployment_strategies").where("id", "=", id).execute();
  }

  private mapRowToDeploymentStrategy(
    row: DeploymentStrategiesRow,
  ): DeploymentStrategy {
    return {
      id: row.id,
      name: row.name,
      description: row.description || null,
      configSchema:
        row.config_schema != null
          ? typeof row.config_schema === "string"
            ? JSON.parse(row.config_schema)
            : row.config_schema
          : null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
    };
  }
}
