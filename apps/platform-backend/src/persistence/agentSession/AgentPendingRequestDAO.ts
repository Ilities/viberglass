import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database, JsonValue } from "../types/database";
import {
  AGENT_PENDING_REQUEST_STATUS,
  type AgentPendingRequestStatus,
  type AgentPendingRequestType,
} from "../../types/agentSession";

type AgentPendingRequestRow = Selectable<Database["agent_pending_requests"]>;

function serializeJson(value: JsonValue | null | undefined): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export interface AgentPendingRequest {
  id: string;
  sessionId: string;
  turnId: string | null;
  jobId: string | null;
  requestType: AgentPendingRequestType;
  status: AgentPendingRequestStatus;
  promptMarkdown: string;
  requestJson: JsonValue | null;
  responseJson: JsonValue | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentPendingRequestInput {
  sessionId: string;
  turnId?: string | null;
  jobId?: string | null;
  requestType: AgentPendingRequestType;
  promptMarkdown: string;
  requestJson?: JsonValue | null;
}

export interface ResolveAgentPendingRequestInput {
  responseJson?: JsonValue | null;
  resolvedBy?: string | null;
  status?: Exclude<AgentPendingRequestStatus, "open">;
}

export class AgentPendingRequestDAO {
  async create(
    input: CreateAgentPendingRequestInput,
  ): Promise<AgentPendingRequest> {
    const row = await db
      .insertInto("agent_pending_requests")
      .values({
        session_id: input.sessionId,
        turn_id: input.turnId ?? null,
        job_id: input.jobId ?? null,
        request_type: input.requestType,
        prompt_markdown: input.promptMarkdown,
        request_json: serializeJson(input.requestJson),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async getById(id: string): Promise<AgentPendingRequest | null> {
    const row = await db
      .selectFrom("agent_pending_requests")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async getOpenBySession(sessionId: string): Promise<AgentPendingRequest | null> {
    const row = await db
      .selectFrom("agent_pending_requests")
      .selectAll()
      .where("session_id", "=", sessionId)
      .where("status", "=", AGENT_PENDING_REQUEST_STATUS.OPEN)
      .orderBy("created_at", "desc")
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async resolve(
    id: string,
    input: ResolveAgentPendingRequestInput = {},
  ): Promise<AgentPendingRequest> {
    await db
      .updateTable("agent_pending_requests")
      .set({
        status: input.status ?? AGENT_PENDING_REQUEST_STATUS.RESOLVED,
        response_json: serializeJson(input.responseJson),
        resolved_by: input.resolvedBy ?? null,
        resolved_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();

    const row = await this.getById(id);
    if (!row) {
      throw new Error("Pending request not found after update");
    }

    return row;
  }

  private mapRow(row: AgentPendingRequestRow): AgentPendingRequest {
    return {
      id: row.id,
      sessionId: row.session_id,
      turnId: row.turn_id,
      jobId: row.job_id,
      requestType: row.request_type,
      status: row.status,
      promptMarkdown: row.prompt_markdown,
      requestJson: row.request_json,
      responseJson: row.response_json,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
