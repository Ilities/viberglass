import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database, JsonValue } from "../types/database";
import {
  AGENT_SESSION_ACTIVE_STATUSES,
  AGENT_SESSION_STATUS,
  type AgentSessionMode,
  type AgentSessionStatus,
} from "../../types/agentSession";

type AgentSessionRow = Selectable<Database["agent_sessions"]>;

function serializeJson(value: JsonValue | null | undefined): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export interface AgentSession {
  id: string;
  tenantId: string;
  projectId: string;
  ticketId: string;
  clankerId: string;
  mode: AgentSessionMode;
  status: AgentSessionStatus;
  title: string | null;
  repository: string | null;
  baseBranch: string | null;
  workspaceBranch: string | null;
  draftPullRequestUrl: string | null;
  headCommitHash: string | null;
  lastJobId: string | null;
  lastTurnId: string | null;
  latestPendingRequestId: string | null;
  metadataJson: JsonValue | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CreateAgentSessionInput {
  tenantId: string;
  projectId: string;
  ticketId: string;
  clankerId: string;
  mode: AgentSessionMode;
  status?: AgentSessionStatus;
  title?: string | null;
  repository?: string | null;
  baseBranch?: string | null;
  workspaceBranch?: string | null;
  draftPullRequestUrl?: string | null;
  headCommitHash?: string | null;
  metadataJson?: JsonValue | null;
  createdBy?: string | null;
}

export interface AgentSessionListOptions {
  mode?: AgentSessionMode;
  statuses?: readonly AgentSessionStatus[];
  limit?: number;
}

export interface UpdateAgentSessionInput {
  status?: AgentSessionStatus;
  title?: string | null;
  repository?: string | null;
  baseBranch?: string | null;
  workspaceBranch?: string | null;
  draftPullRequestUrl?: string | null;
  headCommitHash?: string | null;
  lastJobId?: string | null;
  lastTurnId?: string | null;
  latestPendingRequestId?: string | null;
  metadataJson?: JsonValue | null;
  completedAt?: Date | null;
}

export class AgentSessionDAO {
  async create(input: CreateAgentSessionInput): Promise<AgentSession> {
    const row = await db
      .insertInto("agent_sessions")
      .values({
        tenant_id: input.tenantId,
        project_id: input.projectId,
        ticket_id: input.ticketId,
        clanker_id: input.clankerId,
        mode: input.mode,
        status: input.status ?? AGENT_SESSION_STATUS.ACTIVE,
        title: input.title ?? null,
        repository: input.repository ?? null,
        base_branch: input.baseBranch ?? null,
        workspace_branch: input.workspaceBranch ?? null,
        draft_pull_request_url: input.draftPullRequestUrl ?? null,
        head_commit_hash: input.headCommitHash ?? null,
        metadata_json: serializeJson(input.metadataJson),
        created_by: input.createdBy ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async getById(id: string): Promise<AgentSession | null> {
    const row = await db
      .selectFrom("agent_sessions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async getActiveByTicketAndMode(
    ticketId: string,
    mode: AgentSessionMode,
  ): Promise<AgentSession | null> {
    const row = await db
      .selectFrom("agent_sessions")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .where("mode", "=", mode)
      .where("status", "in", [...AGENT_SESSION_ACTIVE_STATUSES])
      .orderBy("created_at", "desc")
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async listByTicket(
    ticketId: string,
    options: AgentSessionListOptions = {},
  ): Promise<AgentSession[]> {
    let query = db
      .selectFrom("agent_sessions")
      .selectAll()
      .where("ticket_id", "=", ticketId);

    if (options.mode) {
      query = query.where("mode", "=", options.mode);
    }

    if (options.statuses && options.statuses.length > 0) {
      query = query.where("status", "in", [...options.statuses]);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map((row) => this.mapRow(row));
  }

  async update(id: string, updates: UpdateAgentSessionInput): Promise<void> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.repository !== undefined) updateData.repository = updates.repository;
    if (updates.baseBranch !== undefined) updateData.base_branch = updates.baseBranch;
    if (updates.workspaceBranch !== undefined) {
      updateData.workspace_branch = updates.workspaceBranch;
    }
    if (updates.draftPullRequestUrl !== undefined) {
      updateData.draft_pull_request_url = updates.draftPullRequestUrl;
    }
    if (updates.headCommitHash !== undefined) {
      updateData.head_commit_hash = updates.headCommitHash;
    }
    if (updates.lastJobId !== undefined) updateData.last_job_id = updates.lastJobId;
    if (updates.lastTurnId !== undefined) updateData.last_turn_id = updates.lastTurnId;
    if (updates.latestPendingRequestId !== undefined) {
      updateData.latest_pending_request_id = updates.latestPendingRequestId;
    }
    if (updates.metadataJson !== undefined) {
      updateData.metadata_json = serializeJson(updates.metadataJson);
    }
    if (updates.completedAt !== undefined) {
      updateData.completed_at = updates.completedAt;
    }

    await db.updateTable("agent_sessions").set(updateData).where("id", "=", id).execute();
  }

  private mapRow(row: AgentSessionRow): AgentSession {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      projectId: row.project_id,
      ticketId: row.ticket_id,
      clankerId: row.clanker_id,
      mode: row.mode,
      status: row.status,
      title: row.title,
      repository: row.repository,
      baseBranch: row.base_branch,
      workspaceBranch: row.workspace_branch,
      draftPullRequestUrl: row.draft_pull_request_url,
      headCommitHash: row.head_commit_hash,
      lastJobId: row.last_job_id,
      lastTurnId: row.last_turn_id,
      latestPendingRequestId: row.latest_pending_request_id,
      metadataJson: row.metadata_json,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }
}
