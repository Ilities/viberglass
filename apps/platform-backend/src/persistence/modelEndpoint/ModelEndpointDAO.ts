import type { Selectable } from "kysely";
import {
  isModelApiFormat,
  isModelEndpointAuth,
  isObjectRecord,
  type ModelEndpoint,
  type ModelEndpointInput,
} from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

function toEndpoint(
  row: Selectable<Database["model_endpoints"]>,
): ModelEndpoint {
  if (
    !isModelApiFormat(row.api_format) ||
    !isModelEndpointAuth(row.auth) ||
    !isObjectRecord(row.extra_headers)
  ) {
    throw new Error("Invalid stored model endpoint");
  }
  const extraHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(row.extra_headers)) {
    if (typeof value !== "string")
      throw new Error("Invalid stored endpoint header");
    extraHeaders[name] = value;
  }
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiFormat: row.api_format,
    auth: row.auth,
    secretId: row.secret_id,
    extraHeaders,
    models: Array.isArray(row.models)
      ? row.models.filter((value): value is string => typeof value === "string")
      : [],
    source: row.source,
    deploymentId: row.deployment_id,
    mayColdStart: row.may_cold_start,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function values(input: ModelEndpointInput) {
  return {
    name: input.name,
    base_url: input.baseUrl.replace(/\/+$/, ""),
    api_format: input.apiFormat,
    auth: JSON.stringify(input.auth),
    secret_id: input.secretId ?? null,
    extra_headers: JSON.stringify(input.extraHeaders),
    models: JSON.stringify(input.models),
    may_cold_start: input.mayColdStart,
    deployment_id: null,
  };
}

export class ModelEndpointDAO {
  async list(): Promise<ModelEndpoint[]> {
    return (
      await db
        .selectFrom("model_endpoints")
        .selectAll()
        .orderBy("name")
        .execute()
    ).map(toEndpoint);
  }

  async get(id: string): Promise<ModelEndpoint | null> {
    const row = await db
      .selectFrom("model_endpoints")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toEndpoint(row) : null;
  }

  async create(input: ModelEndpointInput): Promise<ModelEndpoint> {
    return toEndpoint(
      await db
        .insertInto("model_endpoints")
        .values(values(input))
        .returningAll()
        .executeTakeFirstOrThrow(),
    );
  }

  async update(
    id: string,
    input: ModelEndpointInput,
  ): Promise<ModelEndpoint | null> {
    const row = await db
      .updateTable("model_endpoints")
      .set({ ...values(input), updated_at: new Date() })
      .where("id", "=", id)
      .where("source", "=", "manual")
      .returningAll()
      .executeTakeFirst();
    return row ? toEndpoint(row) : null;
  }

  async delete(id: string): Promise<void> {
    await db
      .deleteFrom("model_endpoints")
      .where("id", "=", id)
      .where("source", "=", "manual")
      .execute();
  }

  async runnersUsing(
    id: string,
  ): Promise<Array<{ name: string; agent: string | null; model: string }>> {
    return db
      .selectFrom("clanker_model_endpoints")
      .innerJoin(
        "clankers",
        "clankers.id",
        "clanker_model_endpoints.clanker_id",
      )
      .select([
        "clankers.name",
        "clankers.agent",
        "clanker_model_endpoints.model",
      ])
      .where("endpoint_id", "=", id)
      .execute();
  }
}
