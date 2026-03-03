import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database, JsonValue } from "../types/database";
import {
  AGENT_TURN_STATUS,
  type AgentTurnRole,
  type AgentTurnStatus,
} from "../../types/agentSession";

type AgentTurnRow = Selectable<Database["agent_turns"]>;

function serializeJson(value: JsonValue | null | undefined): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export interface AgentTurn {
  id: string;
  sessionId: string;
  role: AgentTurnRole;
  status: AgentTurnStatus;
  sequence: number;
  contentMarkdown: string | null;
  contentJson: JsonValue | null;
  jobId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentTurnInput {
  sessionId: string;
  role: AgentTurnRole;
  sequence: number;
  status?: AgentTurnStatus;
  contentMarkdown?: string | null;
  contentJson?: JsonValue | null;
  jobId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export interface UpdateAgentTurnInput {
  status?: AgentTurnStatus;
  contentMarkdown?: string | null;
  contentJson?: JsonValue | null;
  jobId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export class AgentTurnDAO {
  async create(input: CreateAgentTurnInput): Promise<AgentTurn> {
    const row = await db
      .insertInto("agent_turns")
      .values({
        session_id: input.sessionId,
        role: input.role,
        status: input.status ?? AGENT_TURN_STATUS.QUEUED,
        sequence: input.sequence,
        content_markdown: input.contentMarkdown ?? null,
        content_json: serializeJson(input.contentJson),
        job_id: input.jobId ?? null,
        started_at: input.startedAt ?? null,
        completed_at: input.completedAt ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async getById(id: string): Promise<AgentTurn | null> {
    const row = await db
      .selectFrom("agent_turns")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async getByJobId(jobId: string): Promise<AgentTurn | null> {
    const row = await db
      .selectFrom("agent_turns")
      .selectAll()
      .where("job_id", "=", jobId)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async listBySession(sessionId: string): Promise<AgentTurn[]> {
    const rows = await db
      .selectFrom("agent_turns")
      .selectAll()
      .where("session_id", "=", sessionId)
      .orderBy("sequence", "asc")
      .execute();

    return rows.map((row) => this.mapRow(row));
  }

  async update(id: string, updates: UpdateAgentTurnInput): Promise<void> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.contentMarkdown !== undefined) {
      updateData.content_markdown = updates.contentMarkdown;
    }
    if (updates.contentJson !== undefined) {
      updateData.content_json = serializeJson(updates.contentJson);
    }
    if (updates.jobId !== undefined) updateData.job_id = updates.jobId;
    if (updates.startedAt !== undefined) updateData.started_at = updates.startedAt;
    if (updates.completedAt !== undefined) {
      updateData.completed_at = updates.completedAt;
    }

    await db.updateTable("agent_turns").set(updateData).where("id", "=", id).execute();
  }

  private mapRow(row: AgentTurnRow): AgentTurn {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      status: row.status,
      sequence: row.sequence,
      contentMarkdown: row.content_markdown,
      contentJson: row.content_json,
      jobId: row.job_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
