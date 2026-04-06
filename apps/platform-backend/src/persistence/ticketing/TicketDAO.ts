import { v4 as uuidv4 } from "uuid";
import type { Selectable } from "kysely";
import { sql } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import {
  TICKET_ARCHIVE_FILTER,
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
} from "@viberglass/types";
import type {
  Ticket,
  CreateTicketRequest,
  UpdateTicketRequest,
  MediaAsset,
  TicketStats,
  TicketSystem,
  TicketArchiveFilter,
  TicketLifecycleStatus,
  TicketWorkflowPhase,
  Severity,
} from "@viberglass/types";
import { buildMediaContentUrl } from "../../services/ticket-media/publicApiUrl";

type TicketsRow = Selectable<Database["tickets"]>;

interface TicketListQuery {
  limit?: number;
  offset?: number;
  projectId?: string;
  statuses?: TicketLifecycleStatus[];
  workflowPhases?: TicketWorkflowPhase[];
  archived?: TicketArchiveFilter;
  severity?: Severity;
  search?: string;
}

interface TicketListResult {
  tickets: Ticket[];
  total: number;
}

// Normalize legacy ticket_system values (2 was the old GitHub enum value)
function normalizeTicketSystem(value: unknown): TicketSystem {
  if (value === 2) return "github";
  if (typeof value === "string" && isValidTicketSystem(value)) return value;
  return "custom";
}

function isValidTicketSystem(value: string): value is TicketSystem {
  const validSystems: TicketSystem[] = [
    "jira", "linear", "github", "gitlab", "bitbucket",
    "azure", "asana", "trello", "monday", "clickup",
    "shortcut", "slack", "custom"
  ];
  return validSystems.includes(value as TicketSystem);
}

function normalizeTicketStatus(value: unknown): TicketLifecycleStatus {
  if (
    value === TICKET_STATUS.OPEN ||
    value === TICKET_STATUS.IN_PROGRESS ||
    value === TICKET_STATUS.RESOLVED
  ) {
    return value;
  }
  return TICKET_STATUS.OPEN;
}

function normalizeWorkflowPhase(value: unknown): TicketWorkflowPhase {
  if (
    value === TICKET_WORKFLOW_PHASE.RESEARCH ||
    value === TICKET_WORKFLOW_PHASE.PLANNING ||
    value === TICKET_WORKFLOW_PHASE.EXECUTION
  ) {
    return value;
  }

  return TICKET_WORKFLOW_PHASE.EXECUTION;
}

export class TicketDAO {
  async createTicket(
    request: CreateTicketRequest,
    screenshotAsset?: MediaAsset,
    recordingAsset?: MediaAsset,
  ): Promise<Ticket> {
    return await db.transaction().execute(async (trx) => {
      const ticketId = uuidv4();
      const timestamp = new Date();

      if (screenshotAsset) {
        // Insert screenshot media asset
        await trx
          .insertInto("media_assets")
          .values({
            id: screenshotAsset.id,
            filename: screenshotAsset.filename,
            mime_type: screenshotAsset.mimeType,
            size: screenshotAsset.size,
            url: screenshotAsset.storageUrl || screenshotAsset.url,
            uploaded_at: screenshotAsset.uploadedAt,
          })
          .execute();
      }

      // Insert recording if provided
      if (recordingAsset) {
        await trx
          .insertInto("media_assets")
          .values({
            id: recordingAsset.id,
            filename: recordingAsset.filename,
            mime_type: recordingAsset.mimeType,
            size: recordingAsset.size,
            url: recordingAsset.storageUrl || recordingAsset.url,
            uploaded_at: recordingAsset.uploadedAt,
          })
          .execute();
      }

      // Insert ticket
      const result = await trx
        .insertInto("tickets")
        .values({
          id: ticketId,
          project_id: request.projectId,
          timestamp: timestamp,
          title: request.title,
          description: request.description,
          severity: request.severity,
          category: request.category,
          metadata: JSON.stringify(request.metadata),
          screenshot_id: screenshotAsset?.id ?? null,
          recording_id: recordingAsset?.id || null,
          annotations: JSON.stringify(request.annotations),
          ticket_system: request.ticketSystem,
          auto_fix_requested: request.autoFixRequested,
          ticket_status: TICKET_STATUS.OPEN,
          workflow_phase: request.workflowPhase ?? TICKET_WORKFLOW_PHASE.RESEARCH,
          workflow_overridden_at: request.workflowPhase === TICKET_WORKFLOW_PHASE.EXECUTION ? timestamp : null,
          workflow_override_reason: request.workflowPhase === TICKET_WORKFLOW_PHASE.EXECUTION ? "Created with execution phase" : null,
          archived_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapRowToTicket({
        ...result,
        ...(screenshotAsset && {
          screenshot_id: screenshotAsset.id,
          screenshot_filename: screenshotAsset.filename,
          screenshot_mime_type: screenshotAsset.mimeType,
          screenshot_size: screenshotAsset.size,
          screenshot_url: screenshotAsset.storageUrl || screenshotAsset.url,
          screenshot_uploaded_at: new Date(),
        }),
        ...(recordingAsset && {
          recording_id: recordingAsset.id,
          recording_filename: recordingAsset.filename,
          recording_mime_type: recordingAsset.mimeType,
          recording_size: recordingAsset.size,
          recording_url: recordingAsset.storageUrl || recordingAsset.url,
          recording_uploaded_at: new Date(),
        }),
      });
    });
  }

  async getTicket(id: string): Promise<Ticket | null> {
    const row = await db
      .selectFrom("tickets as t")
      .leftJoin("media_assets as s", "t.screenshot_id", "s.id")
      .leftJoin("media_assets as r", "t.recording_id", "r.id")
      .select([
        "t.id",
        "t.project_id",
        "t.timestamp",
        "t.title",
        "t.description",
        "t.severity",
        "t.category",
        "t.metadata",
        "t.annotations",
        "t.external_ticket_id",
        "t.external_ticket_url",
        "t.ticket_system",
        "t.auto_fix_requested",
        "t.auto_fix_status",
        "t.ticket_status",
        "t.workflow_phase",
        "t.workflow_override_reason",
        "t.workflow_overridden_at",
        "t.workflow_overridden_by",
        "t.archived_at",
        "t.pull_request_url",
        "t.created_at",
        "t.updated_at",
        "s.id as screenshot_id",
        "s.filename as screenshot_filename",
        "s.mime_type as screenshot_mime_type",
        "s.size as screenshot_size",
        "s.url as screenshot_url",
        "s.uploaded_at as screenshot_uploaded_at",
        "r.id as recording_id",
        "r.filename as recording_filename",
        "r.mime_type as recording_mime_type",
        "r.size as recording_size",
        "r.url as recording_url",
        "r.uploaded_at as recording_uploaded_at",
      ])
      .where("t.id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToTicket(row);
  }

  async findLatestShortcutStoryTicketByStoryId(
    projectId: string,
    storyId: string,
  ): Promise<Ticket | null> {
    const row = await db
      .selectFrom("tickets as t")
      .leftJoin("media_assets as s", "t.screenshot_id", "s.id")
      .leftJoin("media_assets as r", "t.recording_id", "r.id")
      .select([
        "t.id",
        "t.project_id",
        "t.timestamp",
        "t.title",
        "t.description",
        "t.severity",
        "t.category",
        "t.metadata",
        "t.annotations",
        "t.external_ticket_id",
        "t.external_ticket_url",
        "t.ticket_system",
        "t.auto_fix_requested",
        "t.auto_fix_status",
        "t.ticket_status",
        "t.workflow_phase",
        "t.workflow_override_reason",
        "t.workflow_overridden_at",
        "t.workflow_overridden_by",
        "t.archived_at",
        "t.pull_request_url",
        "t.created_at",
        "t.updated_at",
        "s.id as screenshot_id",
        "s.filename as screenshot_filename",
        "s.mime_type as screenshot_mime_type",
        "s.size as screenshot_size",
        "s.url as screenshot_url",
        "s.uploaded_at as screenshot_uploaded_at",
        "r.id as recording_id",
        "r.filename as recording_filename",
        "r.mime_type as recording_mime_type",
        "r.size as recording_size",
        "r.url as recording_url",
        "r.uploaded_at as recording_uploaded_at",
      ])
      .where("t.project_id", "=", projectId)
      .where("t.ticket_system", "=", "shortcut")
      .where(sql<boolean>`t.metadata ->> 'eventType' = 'story_created'`)
      .where((eb) =>
        eb.or([
          eb("t.external_ticket_id", "=", storyId),
          sql<boolean>`t.metadata ->> 'externalTicketId' = ${storyId}`,
          sql<boolean>`t.metadata ->> 'shortcutStoryId' = ${storyId}`,
        ]),
      )
      .orderBy("t.created_at", "desc")
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.mapRowToTicket(row);
  }

  async updateTicket(id: string, updates: UpdateTicketRequest): Promise<void> {
    const statusUpdate = this.resolveStatusUpdate(updates);

    await db
      .updateTable("tickets")
      .set({
        title: updates.title,
        description: updates.description,
        severity: updates.severity,
        category: updates.category,
        ticket_status: statusUpdate,
        external_ticket_id: updates.externalTicketId,
        external_ticket_url: updates.externalTicketUrl,
        auto_fix_status: updates.autoFixStatus,
        pull_request_url: updates.pullRequestUrl,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async updateWorkflowPhase(
    id: string,
    workflowPhase: TicketWorkflowPhase,
  ): Promise<void> {
    await db
      .updateTable("tickets")
      .set({
        workflow_phase: workflowPhase,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async overrideWorkflowToExecution(
    id: string,
    reason: string,
    actor?: string,
  ): Promise<void> {
    await db
      .updateTable("tickets")
      .set({
        workflow_phase: TICKET_WORKFLOW_PHASE.EXECUTION,
        workflow_override_reason: reason,
        workflow_overridden_at: new Date(),
        workflow_overridden_by: actor || null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async getWorkflowPhase(id: string): Promise<TicketWorkflowPhase | null> {
    const row = await db
      .selectFrom("tickets")
      .select("workflow_phase")
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return normalizeWorkflowPhase(row.workflow_phase);
  }

  async hasExecutionJob(ticketId: string): Promise<boolean> {
    const row = await db
      .selectFrom("jobs")
      .select("id")
      .where("ticket_id", "=", ticketId)
      .where("job_kind", "=", "execution")
      .limit(1)
      .executeTakeFirst();

    return Boolean(row);
  }

  async archiveTickets(ticketIds: string[]): Promise<number> {
    if (ticketIds.length === 0) {
      return 0;
    }

    const result = await db
      .updateTable("tickets")
      .set({
        archived_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "in", ticketIds)
      .where("archived_at", "is", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows ?? 0);
  }

  async unarchiveTickets(ticketIds: string[]): Promise<number> {
    if (ticketIds.length === 0) {
      return 0;
    }

    const result = await db
      .updateTable("tickets")
      .set({
        archived_at: null,
        updated_at: new Date(),
      })
      .where("id", "in", ticketIds)
      .where("archived_at", "is not", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows ?? 0);
  }

  async deleteTicket(id: string): Promise<boolean> {
    const result = await db
      .deleteFrom("tickets")
      .where("id", "=", id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  async getTicketsByProject(
    projectId: string,
    limit = 50,
    offset = 0,
  ): Promise<Ticket[]> {
    const result = await this.getTicketsWithFilters({ projectId, limit, offset });
    return result.tickets;
  }

  async getTickets(
    limit = 50,
    offset = 0,
    projectId?: string,
  ): Promise<Ticket[]> {
    const result = await this.getTicketsWithFilters({ limit, offset, projectId });
    return result.tickets;
  }

  async getTicketsWithFilters(params: TicketListQuery): Promise<TicketListResult> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    const archivedMode = params.archived ?? TICKET_ARCHIVE_FILTER.EXCLUDE;
    const search = params.search?.trim();

    let query = db
      .selectFrom("tickets as t")
      .leftJoin("media_assets as s", "t.screenshot_id", "s.id")
      .leftJoin("media_assets as r", "t.recording_id", "r.id")
      .select([
        "t.id",
        "t.project_id",
        "t.timestamp",
        "t.title",
        "t.description",
        "t.severity",
        "t.category",
        "t.metadata",
        "t.annotations",
        "t.external_ticket_id",
        "t.external_ticket_url",
        "t.ticket_system",
        "t.auto_fix_requested",
        "t.auto_fix_status",
        "t.ticket_status",
        "t.workflow_phase",
        "t.workflow_override_reason",
        "t.workflow_overridden_at",
        "t.workflow_overridden_by",
        "t.archived_at",
        "t.pull_request_url",
        "t.created_at",
        "t.updated_at",
        "s.id as screenshot_id",
        "s.filename as screenshot_filename",
        "s.mime_type as screenshot_mime_type",
        "s.size as screenshot_size",
        "s.url as screenshot_url",
        "s.uploaded_at as screenshot_uploaded_at",
        "r.id as recording_id",
        "r.filename as recording_filename",
        "r.mime_type as recording_mime_type",
        "r.size as recording_size",
        "r.url as recording_url",
        "r.uploaded_at as recording_uploaded_at",
      ]);

    if (params.projectId) {
      query = query.where("t.project_id", "=", params.projectId);
    }

    if (params.statuses && params.statuses.length > 0) {
      query = query.where("t.ticket_status", "in", params.statuses);
    }

    if (params.workflowPhases && params.workflowPhases.length > 0) {
      query = query.where("t.workflow_phase", "in", params.workflowPhases);
    }

    if (archivedMode === TICKET_ARCHIVE_FILTER.EXCLUDE) {
      query = query.where("t.archived_at", "is", null);
    } else if (archivedMode === TICKET_ARCHIVE_FILTER.ONLY) {
      query = query.where("t.archived_at", "is not", null);
    }

    if (params.severity) {
      query = query.where("t.severity", "=", params.severity);
    }

    if (search) {
      query = query.where(
        sql<boolean>`t.title ILIKE ${`%${search}%`} OR t.description ILIKE ${`%${search}%`}`,
      );
    }

    const rows = await query
      .orderBy("t.created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    let totalQuery = db
      .selectFrom("tickets as t")
      .select(sql<string>`COUNT(*)`.as("total"));

    if (params.projectId) {
      totalQuery = totalQuery.where("t.project_id", "=", params.projectId);
    }

    if (params.statuses && params.statuses.length > 0) {
      totalQuery = totalQuery.where("t.ticket_status", "in", params.statuses);
    }

    if (params.workflowPhases && params.workflowPhases.length > 0) {
      totalQuery = totalQuery.where("t.workflow_phase", "in", params.workflowPhases);
    }

    if (archivedMode === TICKET_ARCHIVE_FILTER.EXCLUDE) {
      totalQuery = totalQuery.where("t.archived_at", "is", null);
    } else if (archivedMode === TICKET_ARCHIVE_FILTER.ONLY) {
      totalQuery = totalQuery.where("t.archived_at", "is not", null);
    }

    if (params.severity) {
      totalQuery = totalQuery.where("t.severity", "=", params.severity);
    }

    if (search) {
      totalQuery = totalQuery.where(
        sql<boolean>`t.title ILIKE ${`%${search}%`} OR t.description ILIKE ${`%${search}%`}`,
      );
    }

    const totalRow = await totalQuery.executeTakeFirst();

    return {
      tickets: rows.map((row) => this.mapRowToTicket(row)),
      total: parseInt(totalRow?.total || "0", 10),
    };
  }

  async getTicketStats(projectId?: string): Promise<TicketStats> {
    const baseQuery = projectId
      ? db
          .selectFrom("tickets as t")
          .where("t.project_id", "=", projectId)
          .where("t.archived_at", "is", null)
      : db.selectFrom("tickets as t").where("t.archived_at", "is", null);

    const statsRow = await baseQuery
      .select([
        sql<string>`COUNT(*)`.as("total"),
        sql<string>`COUNT(*) FILTER (WHERE t.ticket_status = ${TICKET_STATUS.RESOLVED})`.as(
          "resolved",
        ),
        sql<string>`COUNT(*) FILTER (WHERE t.ticket_status = ${TICKET_STATUS.IN_PROGRESS})`.as(
          "in_progress",
        ),
        sql<string>`COUNT(*) FILTER (WHERE t.ticket_status = ${TICKET_STATUS.OPEN})`.as(
          "open",
        ),
        sql<string>`COUNT(*) FILTER (WHERE t.auto_fix_requested IS TRUE)`.as(
          "auto_fix_requested",
        ),
        sql<string>`COUNT(*) FILTER (WHERE t.auto_fix_status = 'completed')`.as(
          "auto_fix_completed",
        ),
        sql<string>`COUNT(*) FILTER (WHERE t.auto_fix_status = 'failed')`.as(
          "auto_fix_failed",
        ),
        sql<string>`COUNT(*) FILTER (WHERE t.auto_fix_status = 'pending' OR (t.auto_fix_requested IS TRUE AND t.auto_fix_status IS NULL))`.as(
          "auto_fix_pending",
        ),
        sql<string>`COUNT(*) FILTER (WHERE t.ticket_status = ${TICKET_STATUS.IN_REVIEW})`.as(
          "in_review",
        ),
      ])
      .executeTakeFirst();

    const severityRows = await baseQuery
      .select(["t.severity", sql<string>`COUNT(*)`.as("count")])
      .groupBy("t.severity")
      .execute();

    const phaseRows = await baseQuery
      .select(["t.workflow_phase", sql<string>`COUNT(*)`.as("count")])
      .groupBy("t.workflow_phase")
      .execute();

    const categoryRows = await baseQuery
      .select(["t.category", sql<string>`COUNT(*)`.as("count")])
      .groupBy("t.category")
      .execute();

    const bySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const row of severityRows) {
      const key = row.severity as keyof typeof bySeverity;
      if (key in bySeverity) {
        bySeverity[key] = parseInt(row.count || "0");
      }
    }

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      if (!row.category) continue;
      byCategory[row.category] = parseInt(row.count || "0");
    }

    const total = parseInt(statsRow?.total || "0");
    const resolved = parseInt(statsRow?.resolved || "0");
    const inProgress = parseInt(statsRow?.in_progress || "0");
    const open = parseInt(statsRow?.open || "0");
    const inReview = parseInt(statsRow?.in_review || "0");
    const autoFixRequested = parseInt(statsRow?.auto_fix_requested || "0");
    const autoFixCompleted = parseInt(statsRow?.auto_fix_completed || "0");
    const autoFixPending = parseInt(statsRow?.auto_fix_pending || "0");
    const autoFixFailed = parseInt(statsRow?.auto_fix_failed || "0");

    const byPhase = {
      research: 0,
      planning: 0,
      execution: 0,
    };

    for (const row of phaseRows) {
      const key = row.workflow_phase as keyof typeof byPhase;
      if (key in byPhase) {
        byPhase[key] = parseInt(row.count || "0");
      }
    }

    return {
      total,
      open,
      resolved,
      inProgress,
      inReview,
      byPhase,
      bySeverity,
      byCategory,
      autoFixStats: {
        requested: autoFixRequested,
        completed: autoFixCompleted,
        pending: autoFixPending,
        failed: autoFixFailed,
      },
    };
  }

  async getMediaAssetById(mediaId: string): Promise<MediaAsset | null> {
    const row = await db
      .selectFrom("media_assets")
      .selectAll()
      .where("id", "=", mediaId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: Number(row.size),
      url: buildMediaContentUrl(row.id),
      storageUrl: row.url,
      uploadedAt: this.toISOString(row.uploaded_at),
    };
  }

  private resolveStatusUpdate(
    updates: UpdateTicketRequest,
  ): TicketLifecycleStatus | undefined {
    if (updates.status) {
      return updates.status;
    }

    if (updates.autoFixStatus === "in_progress") {
      return TICKET_STATUS.IN_PROGRESS;
    }

    if (updates.autoFixStatus === "completed") {
      return TICKET_STATUS.RESOLVED;
    }

    if (updates.autoFixStatus === "failed" || updates.autoFixStatus === "pending") {
      return TICKET_STATUS.OPEN;
    }

    if (updates.externalTicketId && updates.externalTicketId.trim().length > 0) {
      return TICKET_STATUS.RESOLVED;
    }

    return undefined;
  }

  private toISOString(date: unknown): string {
    if (date instanceof Date) return date.toISOString();
    if (typeof date === "string") return date;
    return String(date);
  }

  private mapRowToTicket(row: TicketsRow & Record<string, unknown>): Ticket {
    let screenshot: MediaAsset | undefined;
    if (row.screenshot_id) {
      screenshot = {
        id: String(row.screenshot_id),
        filename: String(row.screenshot_filename),
        mimeType: String(row.screenshot_mime_type),
        size: Number(row.screenshot_size),
        url: buildMediaContentUrl(String(row.screenshot_id)),
        storageUrl: String(row.screenshot_url),
        uploadedAt: this.toISOString(row.screenshot_uploaded_at),
      };
    }

    let recording: MediaAsset | undefined;
    if (row.recording_id) {
      recording = {
        id: String(row.recording_id),
        filename: String(row.recording_filename),
        mimeType: String(row.recording_mime_type),
        size: Number(row.recording_size),
        url: buildMediaContentUrl(String(row.recording_id)),
        storageUrl: String(row.recording_url),
        uploadedAt: this.toISOString(row.recording_uploaded_at),
      };
    }

    return {
      id: row.id,
      projectId: row.project_id,
      timestamp: this.toISOString(row.timestamp),
      title: row.title,
      description: row.description,
      severity: row.severity,
      category: row.category,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata,
      screenshot,
      recording,
      annotations:
        typeof row.annotations === "string"
          ? JSON.parse(row.annotations)
          : row.annotations,
      externalTicketId: row.external_ticket_id ?? undefined,
      externalTicketUrl: row.external_ticket_url ?? undefined,
      ticketSystem: normalizeTicketSystem(row.ticket_system),
      autoFixRequested: row.auto_fix_requested,
      autoFixStatus: row.auto_fix_status ?? undefined,
      status: normalizeTicketStatus(row.ticket_status),
      workflowPhase: normalizeWorkflowPhase(row.workflow_phase),
      workflowOverrideReason: row.workflow_override_reason ?? undefined,
      workflowOverriddenAt: row.workflow_overridden_at
        ? this.toISOString(row.workflow_overridden_at)
        : undefined,
      workflowOverriddenBy: row.workflow_overridden_by ?? undefined,
      archivedAt: row.archived_at ? this.toISOString(row.archived_at) : undefined,
      pullRequestUrl: row.pull_request_url ?? undefined,
      createdAt: this.toISOString(row.created_at),
      updatedAt: this.toISOString(row.updated_at),
    };
  }
}
