import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database, JsonValue } from "../types/database";
import type { AgentSessionEventType } from "../../types/agentSession";

type AgentSessionEventRow = Selectable<Database["agent_session_events"]>;

function serializeJson(value: JsonValue): string {
  return JSON.stringify(value);
}

export interface AgentSessionEvent {
  id: string;
  sessionId: string;
  turnId: string | null;
  jobId: string | null;
  sequence: number | string;
  eventType: AgentSessionEventType;
  payloadJson: JsonValue;
  createdAt: Date;
}

export interface CreateAgentSessionEventInput {
  sessionId: string;
  turnId?: string | null;
  jobId?: string | null;
  sequence: number;
  eventType: AgentSessionEventType;
  payloadJson: JsonValue;
}

export interface AgentSessionEventListOptions {
  afterSequence?: number | string;
  limit?: number;
}

export class AgentSessionEventDAO {
  async create(
    input: CreateAgentSessionEventInput,
  ): Promise<AgentSessionEvent> {
    const row = await db
      .insertInto("agent_session_events")
      .values({
        session_id: input.sessionId,
        turn_id: input.turnId ?? null,
        job_id: input.jobId ?? null,
        sequence: input.sequence,
        event_type: input.eventType,
        payload_json: serializeJson(input.payloadJson),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async createMany(
    inputs: readonly CreateAgentSessionEventInput[],
  ): Promise<AgentSessionEvent[]> {
    if (inputs.length === 0) {
      return [];
    }

    const rows = await db
      .insertInto("agent_session_events")
      .values(
        inputs.map((input) => ({
          session_id: input.sessionId,
          turn_id: input.turnId ?? null,
          job_id: input.jobId ?? null,
          sequence: input.sequence,
          event_type: input.eventType,
          payload_json: serializeJson(input.payloadJson),
        })),
      )
      .returningAll()
      .execute();

    return rows.map((row) => this.mapRow(row));
  }

  async listBySession(
    sessionId: string,
    options: AgentSessionEventListOptions = {},
  ): Promise<AgentSessionEvent[]> {
    let query = db
      .selectFrom("agent_session_events")
      .selectAll()
      .where("session_id", "=", sessionId);

    if (options.afterSequence !== undefined) {
      query = query.where("sequence", ">", options.afterSequence);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const rows = await query.orderBy("sequence", "asc").execute();
    return rows.map((row) => this.mapRow(row));
  }

  async getMaxSequence(sessionId: string): Promise<number> {
    const row = await db
      .selectFrom("agent_session_events")
      .select(db.fn.max("sequence").as("max_seq"))
      .where("session_id", "=", sessionId)
      .executeTakeFirst();
    return Number(row?.max_seq ?? 0);
  }

  private mapRow(row: AgentSessionEventRow): AgentSessionEvent {
    return {
      id: row.id,
      sessionId: row.session_id,
      turnId: row.turn_id,
      jobId: row.job_id,
      sequence: row.sequence,
      eventType: row.event_type,
      payloadJson: row.payload_json,
      createdAt: row.created_at,
    };
  }
}
