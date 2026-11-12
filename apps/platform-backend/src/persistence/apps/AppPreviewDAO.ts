import { sql, type Selectable } from "kysely";
import type { AppPower, AppPreviewState } from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

type AppPreviewRow = Selectable<Database["app_previews"]>;

export interface AppPreviewRecord {
  id: string;
  address: string;
  projectId: string;
  ticketId: string;
  pullRequestUrl: string;
  commitSha: string;
  /** The preview build of `commitSha`. */
  releaseId: string | null;
  /** The build its instance runs, while it runs one. */
  runningReleaseId: string | null;
  power: AppPower;
  state: AppPreviewState;
  statusMessage: string | null;
  busySince: Date | null;
  startedAt: Date | null;
  lastOpenedAt: Date | null;
  triedCommitSha: string | null;
}

export type AppPreviewChange = Partial<
  Pick<AppPreviewRecord, "power" | "state" | "statusMessage" | "runningReleaseId" | "startedAt" | "triedCommitSha">
>;

/** What the gateway needs to serve a preview's address. */
export interface PreviewAddressRef {
  previewId: string;
  address: string;
  projectId: string;
  projectSlug: string;
  isPrivate: boolean;
  ticketId: string;
  taskKey: string;
  state: AppPreviewState;
}

export class AppPreviewDAO {
  async get(previewId: string): Promise<AppPreviewRecord | null> {
    const row = await db.selectFrom("app_previews").selectAll().where("id", "=", previewId).executeTakeFirst();
    return row ? toPreview(row) : null;
  }

  async findForChange(ticketId: string, pullRequestUrl: string): Promise<AppPreviewRecord | null> {
    const row = await db
      .selectFrom("app_previews")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .where("pull_request_url", "=", pullRequestUrl)
      .executeTakeFirst();
    return row ? toPreview(row) : null;
  }

  async listForTask(ticketId: string): Promise<AppPreviewRecord[]> {
    const rows = await db.selectFrom("app_previews").selectAll().where("ticket_id", "=", ticketId).orderBy("created_at", "asc").execute();
    return rows.map(toPreview);
  }

  /** Newest first. */
  async listForProject(projectId: string): Promise<AppPreviewRecord[]> {
    const rows = await db.selectFrom("app_previews").selectAll().where("project_id", "=", projectId).orderBy("created_at", "desc").execute();
    return rows.map(toPreview);
  }

  /** Null when the change already has a preview, or another preview has the address. */
  async create(input: { address: string; projectId: string; ticketId: string; pullRequestUrl: string; commitSha: string; releaseId: string }): Promise<AppPreviewRecord | null> {
    const row = await db
      .insertInto("app_previews")
      .values({
        address: input.address,
        project_id: input.projectId,
        ticket_id: input.ticketId,
        pull_request_url: input.pullRequestUrl,
        commit_sha: input.commitSha,
        release_id: input.releaseId,
      })
      .onConflict((conflict) => conflict.doNothing())
      .returningAll()
      .executeTakeFirst();
    return row ? toPreview(row) : null;
  }

  /** Try it: run this build, and try again if the last attempt failed. */
  async request(previewId: string, build: { commitSha: string; releaseId: string }): Promise<void> {
    await db
      .updateTable("app_previews")
      .set({
        commit_sha: build.commitSha,
        release_id: build.releaseId,
        power: "on",
        state: sql<AppPreviewState>`CASE WHEN state = 'failed' THEN 'off' ELSE state END`,
        status_message: null,
        updated_at: new Date(),
      })
      .where("id", "=", previewId)
      .execute();
  }

  /** A preview at an address, while its App space isn't archived. */
  async findByAddress(address: string): Promise<PreviewAddressRef | null> {
    const row = await db
      .selectFrom("app_previews")
      .innerJoin("projects", "projects.id", "app_previews.project_id")
      .innerJoin("tickets", "tickets.id", "app_previews.ticket_id")
      .select([
        "app_previews.id",
        "app_previews.address",
        "app_previews.project_id",
        "app_previews.ticket_id",
        "app_previews.state",
        "projects.slug",
        "projects.is_private",
        "tickets.task_key",
      ])
      .where("app_previews.address", "=", address)
      .where("projects.backing_kind", "=", "app")
      .where("projects.archived_at", "is", null)
      .executeTakeFirst();
    return row
      ? {
          previewId: row.id,
          address: row.address,
          projectId: row.project_id,
          projectSlug: row.slug,
          isPrivate: row.is_private,
          ticketId: row.ticket_id,
          taskKey: row.task_key,
          state: row.state,
        }
      : null;
  }

  /** Previews that are on, or not yet off. */
  async listActive(): Promise<AppPreviewRecord[]> {
    const rows = await db
      .selectFrom("app_previews")
      .selectAll()
      .where((eb) => eb.or([eb("power", "=", "on"), eb("state", "!=", "off")]))
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(toPreview);
  }

  /** Previews of changes that were merged or closed, or of App spaces that were archived. */
  async listEnded(): Promise<AppPreviewRecord[]> {
    const rows = await db
      .selectFrom("app_previews")
      .innerJoin("projects", "projects.id", "app_previews.project_id")
      .selectAll("app_previews")
      .where((eb) =>
        eb.or([
          eb("projects.archived_at", "is not", null),
          eb.exists(
            eb.selectFrom("pull_request_outcomes")
              .select("pull_request_outcomes.pull_request_url")
              .whereRef("pull_request_outcomes.pull_request_url", "=", "app_previews.pull_request_url")
              .where("pull_request_outcomes.state", "in", ["merged", "closed"]),
          ),
        ]),
      )
      .execute();
    return rows.map(toPreview);
  }

  /** Marks the preview busy for one start or stop; see `AppDAO.claim`. */
  async claim(previewId: string, staleBefore: Date): Promise<AppPreviewRecord | null> {
    const row = await db
      .updateTable("app_previews")
      .set({ busy_since: new Date() })
      .where("id", "=", previewId)
      .where((eb) => eb.or([eb("busy_since", "is", null), eb("busy_since", "<", staleBefore)]))
      .returningAll()
      .executeTakeFirst();
    return row ? toPreview(row) : null;
  }

  async update(previewId: string, change: AppPreviewChange): Promise<void> {
    await db.updateTable("app_previews").set({ ...columns(change), updated_at: new Date() }).where("id", "=", previewId).execute();
  }

  async finish(previewId: string, change: AppPreviewChange): Promise<void> {
    await db
      .updateTable("app_previews")
      .set({ ...columns(change), busy_since: null, updated_at: new Date() })
      .where("id", "=", previewId)
      .execute();
  }

  async touch(previewId: string, at: Date): Promise<void> {
    await db.updateTable("app_previews").set({ last_opened_at: at }).where("id", "=", previewId).execute();
  }

  async delete(previewId: string): Promise<void> {
    await db.deleteFrom("app_previews").where("id", "=", previewId).execute();
  }
}

function columns(change: AppPreviewChange): Partial<AppPreviewRow> {
  return {
    ...(change.power !== undefined ? { power: change.power } : {}),
    ...(change.state !== undefined ? { state: change.state } : {}),
    ...(change.statusMessage !== undefined ? { status_message: change.statusMessage } : {}),
    ...(change.runningReleaseId !== undefined ? { running_release_id: change.runningReleaseId } : {}),
    ...(change.startedAt !== undefined ? { started_at: change.startedAt } : {}),
    ...(change.triedCommitSha !== undefined ? { tried_commit_sha: change.triedCommitSha } : {}),
  };
}

function toPreview(row: AppPreviewRow): AppPreviewRecord {
  return {
    id: row.id,
    address: row.address,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    pullRequestUrl: row.pull_request_url,
    commitSha: row.commit_sha,
    releaseId: row.release_id,
    runningReleaseId: row.running_release_id,
    power: row.power,
    state: row.state,
    statusMessage: row.status_message,
    busySince: row.busy_since,
    startedAt: row.started_at,
    lastOpenedAt: row.last_opened_at,
    triedCommitSha: row.tried_commit_sha,
  };
}
