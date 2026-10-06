import type { Selectable } from "kysely";
import { isModelHostKind, type ModelHostAccount } from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

export interface ModelHostAccountRecord extends ModelHostAccount {
  clientSecretId: string;
  endpointKeySecretId: string;
  huggingFaceTokenSecretId: string | null;
}

export interface ModelHostAccountValues {
  name: string;
  host: ModelHostAccount["host"];
  clientId: string;
  clientSecretId: string;
  endpointKeySecretId: string;
  huggingFaceTokenSecretId: string | null;
}

function toAccount(
  row: Selectable<Database["model_host_accounts"]>,
): ModelHostAccountRecord {
  if (!isModelHostKind(row.host))
    throw new Error("Invalid stored model host account");
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    clientId: row.client_id,
    hasHuggingFaceToken: row.hugging_face_token_secret_id !== null,
    clientSecretId: row.client_secret_id,
    endpointKeySecretId: row.endpoint_key_secret_id,
    huggingFaceTokenSecretId: row.hugging_face_token_secret_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function columns(values: ModelHostAccountValues) {
  return {
    name: values.name,
    host: values.host,
    client_id: values.clientId,
    client_secret_id: values.clientSecretId,
    endpoint_key_secret_id: values.endpointKeySecretId,
    hugging_face_token_secret_id: values.huggingFaceTokenSecretId,
  };
}

export class ModelHostAccountDAO {
  async list(): Promise<ModelHostAccountRecord[]> {
    return (
      await db
        .selectFrom("model_host_accounts")
        .selectAll()
        .orderBy("name")
        .execute()
    ).map(toAccount);
  }

  async get(id: string): Promise<ModelHostAccountRecord | null> {
    const row = await db
      .selectFrom("model_host_accounts")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toAccount(row) : null;
  }

  async create(values: ModelHostAccountValues): Promise<ModelHostAccountRecord> {
    return toAccount(
      await db
        .insertInto("model_host_accounts")
        .values(columns(values))
        .returningAll()
        .executeTakeFirstOrThrow(),
    );
  }

  async update(
    id: string,
    values: ModelHostAccountValues,
  ): Promise<ModelHostAccountRecord | null> {
    const row = await db
      .updateTable("model_host_accounts")
      .set({ ...columns(values), updated_at: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    return row ? toAccount(row) : null;
  }

  async delete(id: string): Promise<void> {
    await db.deleteFrom("model_host_accounts").where("id", "=", id).execute();
  }

  async deploymentNames(id: string): Promise<string[]> {
    return (
      await db
        .selectFrom("model_deployments")
        .select("name")
        .where("account_id", "=", id)
        .orderBy("name")
        .execute()
    ).map((row) => row.name);
  }
}
