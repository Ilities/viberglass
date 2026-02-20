import { v4 as uuidv4 } from "uuid";
import type { Selectable } from "kysely";
import { sql } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import type {
  Ticket,
  CreateTicketRequest,
  UpdateTicketRequest,
  MediaAsset,
  TicketStats,
  TicketSystem,
} from "@viberglass/types";

type TicketsRow = Selectable<Database["tickets"]>;

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
            url: screenshotAsset.url,
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
            url: recordingAsset.url,
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
          screenshot_url: screenshotAsset.url,
          screenshot_uploaded_at: new Date(),
        }),
        ...(recordingAsset && {
          recording_id: recordingAsset.id,
          recording_filename: recordingAsset.filename,
          recording_mime_type: recordingAsset.mimeType,
          recording_size: recordingAsset.size,
          recording_url: recordingAsset.url,
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
    await db
      .updateTable("tickets")
      .set({
        title: updates.title,
        description: updates.description,
        severity: updates.severity,
        category: updates.category,
        external_ticket_id: updates.externalTicketId,
        external_ticket_url: updates.externalTicketUrl,
        auto_fix_status: updates.autoFixStatus,
        pull_request_url: updates.pullRequestUrl,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
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
    return this.getTickets(limit, offset, projectId);
  }

  async getTickets(
    limit = 50,
    offset = 0,
    projectId?: string,
  ): Promise<Ticket[]> {
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

    if (projectId) {
      query = query.where("t.project_id", "=", projectId);
    }

    const rows = await query
      .orderBy("t.created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRowToTicket(row));
  }

  async getTicketStats(projectId?: string): Promise<TicketStats> {
    const baseQuery = projectId
      ? db.selectFrom("tickets as t").where("t.project_id", "=", projectId)
      : db.selectFrom("tickets as t");

    const statsRow = await baseQuery
      .select([
        sql<string>`COUNT(*)`.as("total"),
        sql<string>`COUNT(*) FILTER (WHERE t.external_ticket_id IS NOT NULL OR t.auto_fix_status = 'completed')`.as(
          "resolved",
        ),
        sql<string>`COUNT(*) FILTER (WHERE t.external_ticket_id IS NULL AND t.auto_fix_status = 'in_progress')`.as(
          "in_progress",
        ),
        sql<string>`COUNT(*) FILTER (WHERE t.external_ticket_id IS NULL AND (t.auto_fix_status IS NULL OR t.auto_fix_status NOT IN ('in_progress', 'completed')))`.as(
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
      ])
      .executeTakeFirst();

    const severityRows = await baseQuery
      .select(["t.severity", sql<string>`COUNT(*)`.as("count")])
      .groupBy("t.severity")
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
    const autoFixRequested = parseInt(statsRow?.auto_fix_requested || "0");
    const autoFixCompleted = parseInt(statsRow?.auto_fix_completed || "0");
    const autoFixPending = parseInt(statsRow?.auto_fix_pending || "0");
    const autoFixFailed = parseInt(statsRow?.auto_fix_failed || "0");

    return {
      total,
      open,
      resolved,
      inProgress,
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
        url: String(row.screenshot_url),
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
        url: String(row.recording_url),
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
      pullRequestUrl: row.pull_request_url ?? undefined,
      createdAt: this.toISOString(row.created_at),
      updatedAt: this.toISOString(row.updated_at),
    };
  }
}
