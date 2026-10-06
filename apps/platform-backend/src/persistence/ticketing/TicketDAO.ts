import { randomUUID } from "crypto";
import { sql } from "kysely";
import db from "../config/database";
import { latestPullRequestUrl } from "./latestPullRequestUrl";
import {
  formatTaskKey,
  NATIVE_TICKET_ORIGIN,
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
} from "@viberglass/types";
import type {
  Ticket,
  CreateTicketRequest,
  UpdateTicketRequest,
  MediaAsset,
  TicketLifecycleStatus,
  TicketWorkflowPhase,
} from "@viberglass/types";
import { buildMediaContentUrl } from "../../services/ticket-media/publicApiUrl";
import { normalizeWorkflowPhase, ticketOfRow, toISOString } from "./ticketRow";


/** Requester, owner (picked, else the space's default, else the requester) and watchers of a new task. */
function initialParticipants(
  request: CreateTicketRequest,
  space: { default_owner_id: string | null; default_reviewer_ids: string[] },
): Array<{ userId: string; role: "requester" | "owner" | "reviewer" | "watcher" }> {
  const owner = request.ownerId ?? space.default_owner_id ?? request.requesterId;
  return [
    ...(request.requesterId ? [{ userId: request.requesterId, role: "requester" as const }] : []),
    ...(owner ? [{ userId: owner, role: "owner" as const }] : []),
    ...space.default_reviewer_ids.map((userId) => ({ userId, role: "reviewer" as const })),
    ...(request.watcherIds ?? []).map((userId) => ({ userId, role: "watcher" as const })),
  ];
}

export class TicketDAO {
  async createTicket(
    request: CreateTicketRequest,
    screenshotAsset?: MediaAsset,
    recordingAsset?: MediaAsset,
  ): Promise<Ticket> {
    return await db.transaction().execute(async (trx) => {
      const ticketId = randomUUID();
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

      // The space's counter row is locked by the update, so concurrent tasks get distinct numbers.
      const counter = await trx
        .updateTable("projects")
        .set((eb) => ({ next_task_number: eb("next_task_number", "+", 1) }))
        .where("id", "=", request.projectId)
        .returning(["key_prefix", "next_task_number", "default_owner_id", "default_reviewer_ids"])
        .executeTakeFirstOrThrow();
      const taskNumber = counter.next_task_number - 1;

      // Insert ticket
      const result = await trx
        .insertInto("tickets")
        .values({
          id: ticketId,
          project_id: request.projectId,
          task_number: taskNumber,
          task_key: formatTaskKey(counter.key_prefix, taskNumber),
          timestamp: timestamp,
          title: request.title,
          description: request.description,
          severity: request.severity ?? "medium",
          category: request.category ?? "General",
          metadata: JSON.stringify(request.metadata),
          screenshot_id: screenshotAsset?.id ?? null,
          recording_id: recordingAsset?.id || null,
          annotations: JSON.stringify(request.annotations),
          ticket_system: request.ticketSystem ?? NATIVE_TICKET_ORIGIN,
          auto_fix_requested: request.autoFixRequested ?? false,
          ticket_status: TICKET_STATUS.OPEN,
          workflow_phase: TICKET_WORKFLOW_PHASE.PLANNING,
          archived_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("task_activity")
        .values({
          ticket_id: ticketId,
          actor_type: request.requesterId ? "human" : "system",
          actor_id: request.requesterId ?? null,
          kind: "task_created",
          payload_json: JSON.stringify({ key: formatTaskKey(counter.key_prefix, taskNumber) }),
        })
        .execute();

      const participants = initialParticipants(request, counter);
      if (participants.length > 0) {
        await trx
          .insertInto("task_participants")
          .values(participants.map((p) => ({ ticket_id: ticketId, user_id: p.userId, role: p.role, added_by: request.requesterId ?? null })))
          .onConflict((oc) => oc.doNothing())
          .execute();
      }

      return ticketOfRow({
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
        latestPullRequestUrl("t").as("pull_request_url"),
        "t.taken_over_by",
        "t.taken_over_at",
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

    return ticketOfRow(row);
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
        latestPullRequestUrl("t").as("pull_request_url"),
        "t.taken_over_by",
        "t.taken_over_at",
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

    return ticketOfRow(row);
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

  /** Whether any run of the ticket is queued or active right now. */
  /** Whether any task in the project has ever had a run. */
  async projectHasRuns(projectId: string): Promise<boolean> {
    const row = await db
      .selectFrom("jobs")
      .innerJoin("tickets", "tickets.id", "jobs.ticket_id")
      .select("jobs.id")
      .where("tickets.project_id", "=", projectId)
      .limit(1)
      .executeTakeFirst();

    return Boolean(row);
  }

  async hasRunningJob(ticketId: string): Promise<boolean> {
    const row = await db
      .selectFrom("jobs")
      .select("id")
      .where("ticket_id", "=", ticketId)
      .where("status", "in", ["queued", "active"])
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

  /** Just enough of a task to name and link it, e.g. in a notification. */
  async getSummary(id: string): Promise<{ title: string; key: string; spaceSlug: string; pullRequestUrl: string | null } | null> {
    const row = await db
      .selectFrom("tickets")
      .innerJoin("projects", "projects.id", "tickets.project_id")
      .select(["tickets.title", "tickets.task_key", latestPullRequestUrl("tickets").as("pull_request_url"), "projects.slug"])
      .where("tickets.id", "=", id)
      .executeTakeFirst();
    return row ? { title: row.title, key: row.task_key, spaceSlug: row.slug, pullRequestUrl: row.pull_request_url } : null;
  }

  async findIdByKey(key: string): Promise<string | null> {
    const row = await db.selectFrom("tickets").select("id").where("task_key", "=", key).executeTakeFirst();
    return row?.id ?? null;
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
      uploadedAt: toISOString(row.uploaded_at),
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


}
