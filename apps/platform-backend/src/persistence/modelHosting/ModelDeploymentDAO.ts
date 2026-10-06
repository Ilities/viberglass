import type { Selectable } from "kysely";
import {
  isModelDeploymentMode,
  isModelHostKind,
  isObjectRecord,
  type ModelDeployment,
  type ModelDeploymentMode,
  type ModelEndpointInput,
} from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";
import { modelEndpointValues } from "../modelEndpoint/ModelEndpointDAO";

export interface ModelDeploymentRecord extends ModelDeployment {
  externalId: string;
}

export interface NewModelDeployment {
  name: string;
  accountId: string;
  externalId: string;
  model: string;
  flavour: { id: string; gpuCount: number };
  servingArgs: string[];
  mode: ModelDeploymentMode;
}

type DeploymentRow = Selectable<Database["model_deployments"]> & {
  host: string;
  endpoint_id: string;
};

function toDeployment(row: DeploymentRow): ModelDeploymentRecord {
  const flavour = row.flavour;
  if (
    !isModelDeploymentMode(row.mode) ||
    !isModelHostKind(row.host) ||
    !isObjectRecord(flavour) ||
    typeof flavour.id !== "string" ||
    typeof flavour.gpuCount !== "number" ||
    !Array.isArray(row.serving_args)
  ) {
    throw new Error("Invalid stored model deployment");
  }
  return {
    id: row.id,
    name: row.name,
    accountId: row.account_id,
    host: row.host,
    externalId: row.external_id,
    model: row.model,
    flavour: { id: flavour.id, gpuCount: flavour.gpuCount },
    servingArgs: row.serving_args.filter(
      (arg): arg is string => typeof arg === "string",
    ),
    mode: row.mode,
    endpointId: row.endpoint_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function selectDeployments() {
  return db
    .selectFrom("model_deployments")
    .innerJoin(
      "model_host_accounts",
      "model_host_accounts.id",
      "model_deployments.account_id",
    )
    .innerJoin(
      "model_endpoints",
      "model_endpoints.deployment_id",
      "model_deployments.id",
    )
    .selectAll("model_deployments")
    .select(["model_host_accounts.host", "model_endpoints.id as endpoint_id"]);
}

export class ModelDeploymentDAO {
  async list(): Promise<ModelDeploymentRecord[]> {
    return (
      await selectDeployments().orderBy("model_deployments.name").execute()
    ).map(toDeployment);
  }

  async get(id: string): Promise<ModelDeploymentRecord | null> {
    const row = await selectDeployments()
      .where("model_deployments.id", "=", id)
      .executeTakeFirst();
    return row ? toDeployment(row) : null;
  }

  async getByEndpoint(endpointId: string): Promise<ModelDeploymentRecord | null> {
    const row = await selectDeployments()
      .where("model_endpoints.id", "=", endpointId)
      .executeTakeFirst();
    return row ? toDeployment(row) : null;
  }

  /** Stores the deployment and the endpoint it owns together. */
  async create(
    deployment: NewModelDeployment,
    endpoint: ModelEndpointInput,
  ): Promise<ModelDeploymentRecord> {
    const id = await db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto("model_deployments")
        .values({
          name: deployment.name,
          account_id: deployment.accountId,
          external_id: deployment.externalId,
          model: deployment.model,
          flavour: JSON.stringify(deployment.flavour),
          serving_args: JSON.stringify(deployment.servingArgs),
          mode: deployment.mode,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("model_endpoints")
        .values(modelEndpointValues(endpoint, row.id))
        .execute();
      return row.id;
    });
    const created = await this.get(id);
    if (!created) throw new Error("The new model deployment was not stored");
    return created;
  }

  async setMode(id: string, mode: ModelDeploymentMode): Promise<void> {
    await db
      .updateTable("model_deployments")
      .set({ mode, updated_at: new Date() })
      .where("id", "=", id)
      .execute();
  }

  async delete(id: string): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("model_endpoints")
        .where("deployment_id", "=", id)
        .execute();
      await trx.deleteFrom("model_deployments").where("id", "=", id).execute();
    });
  }
}
