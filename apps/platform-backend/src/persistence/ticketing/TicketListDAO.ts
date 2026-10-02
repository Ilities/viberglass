import { sql } from "kysely";
import {
  TICKET_ARCHIVE_FILTER,
  TICKET_STATUS,
  type Severity,
  type Ticket,
  type TicketArchiveFilter,
  type TicketLifecycleStatus,
  type TicketStats,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import db from "../config/database";
import { ticketOfRow } from "./ticketRow";

export interface TicketListQuery {
  limit?: number;
  offset?: number;
  projectId?: string;
  /** Limits the list to these spaces; null or omitted means all. */
  projectIds?: string[] | null;
  statuses?: TicketLifecycleStatus[];
  workflowPhases?: TicketWorkflowPhase[];
  archived?: TicketArchiveFilter;
  severity?: Severity;
  search?: string;
}

export interface TicketListResult {
  tickets: Ticket[];
  total: number;
}

/** Lists of tasks, filtered and paged, and the counts across them. */
export class TicketListDAO {
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
        "t.task_number",
        "t.task_key",
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
        "t.archived_at",
        "t.pull_request_url",
        "t.taken_over_by",
        "t.taken_over_at",
        "t.task_branch",
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
    if (params.projectIds) {
      query = params.projectIds.length > 0 ? query.where("t.project_id", "in", params.projectIds) : query.where(sql<boolean>`false`);
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
    if (params.projectIds) {
      totalQuery =
        params.projectIds.length > 0 ? totalQuery.where("t.project_id", "in", params.projectIds) : totalQuery.where(sql<boolean>`false`);
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
      tickets: rows.map((row) => ticketOfRow(row)),
      total: parseInt(totalRow?.total || "0", 10),
    };
  }

  /** `projectIds` limits the stats to these spaces; null or omitted means all. */
  async getTicketStats(projectId?: string, projectIds: string[] | null = null): Promise<TicketStats> {
    let baseQuery = db.selectFrom("tickets as t").where("t.archived_at", "is", null);
    if (projectId) baseQuery = baseQuery.where("t.project_id", "=", projectId);
    if (projectIds) {
      baseQuery = projectIds.length > 0 ? baseQuery.where("t.project_id", "in", projectIds) : baseQuery.where(sql<boolean>`false`);
    }

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
}
