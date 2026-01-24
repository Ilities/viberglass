import { v4 as uuidv4 } from "uuid";
import db from "../config/database";
import {
  Ticket,
  CreateTicketRequest,
  UpdateTicketRequest,
  MediaAsset,
} from "@viberglass/types";

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
        screenshot_id: screenshotAsset?.id,
        screenshot_filename: screenshotAsset?.filename,
        screenshot_mime_type: screenshotAsset?.mimeType,
        screenshot_size: screenshotAsset?.size,
        screenshot_url: screenshotAsset?.url,
        screenshot_uploaded_at: screenshotAsset?.uploadedAt,
        recording_id: recordingAsset?.id,
        recording_filename: recordingAsset?.filename,
        recording_mime_type: recordingAsset?.mimeType,
        recording_size: recordingAsset?.size,
        recording_url: recordingAsset?.url,
        recording_uploaded_at: recordingAsset?.uploadedAt,
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
    const rows = await db
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
      .orderBy("t.created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRowToTicket(row));
  }

  private toISOString(date: Date | string): string {
    return date instanceof Date ? date.toISOString() : date;
  }

  private mapRowToTicket(row: any): Ticket {
    const screenshot: MediaAsset = {
      id: row.screenshot_id,
      filename: row.screenshot_filename,
      mimeType: row.screenshot_mime_type,
      size: Number(row.screenshot_size),
      url: row.screenshot_url,
      uploadedAt: this.toISOString(row.screenshot_uploaded_at),
    };

    let recording: MediaAsset | undefined;
    if (row.recording_id) {
      recording = {
        id: row.recording_id,
        filename: row.recording_filename,
        mimeType: row.recording_mime_type,
        size: Number(row.recording_size),
        url: row.recording_url,
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
      externalTicketId: row.external_ticket_id,
      externalTicketUrl: row.external_ticket_url,
      ticketSystem: row.ticket_system,
      autoFixRequested: row.auto_fix_requested,
      autoFixStatus: row.auto_fix_status,
      pullRequestUrl: row.pull_request_url,
      createdAt: this.toISOString(row.created_at),
      updatedAt: this.toISOString(row.updated_at),
    };
  }
}
