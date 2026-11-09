import type { Kysely } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import { spaceRunIds } from "./spaceRunIds";

/** What a space has that's kept outside its own rows, found before it's deleted. */
export interface SpaceHoldings {
  runIds: string[];
  /** Runs still queued or running, whose workers have to be stopped. */
  activeRunIds: string[];
  taskIds: string[];
  sessionIds: string[];
  /** Screenshots, recordings and message images of the space's tasks that nothing else uses. */
  media: Array<{ id: string; url: string }>;
}

export class SpaceDeletionDAO {
  async holdings(projectId: string): Promise<SpaceHoldings> {
    const [runs, tasks, sessions, media] = await Promise.all([
      db.selectFrom("jobs").select(["id", "status"]).where("id", "in", spaceRunIds(db, projectId)).execute(),
      db.selectFrom("tickets").select("id").where("project_id", "=", projectId).execute(),
      db.selectFrom("agent_sessions").select("id").where("project_id", "=", projectId).execute(),
      db
        .selectFrom("media_assets")
        .select(["id", "url"])
        .where("id", "in", mediaIds(db, "=", projectId))
        .where("id", "not in", mediaIds(db, "<>", projectId))
        .execute(),
    ]);
    return {
      runIds: runs.map((run) => run.id),
      activeRunIds: runs.filter((run) => run.status === "queued" || run.status === "active").map((run) => run.id),
      taskIds: tasks.map((task) => task.id),
      sessionIds: sessions.map((session) => session.id),
      media,
    };
  }

  /** The space with its runs, and the media its tasks alone used, all or nothing. */
  async delete(projectId: string, mediaIdsToDelete: string[]): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("jobs").where("id", "in", spaceRunIds(trx, projectId)).execute();
      await trx.deleteFrom("projects").where("id", "=", projectId).execute();
      if (mediaIdsToDelete.length > 0) await trx.deleteFrom("media_assets").where("id", "in", mediaIdsToDelete).execute();
    });
  }
}

/** Media used by tasks in the space (`=`) or in any other space (`<>`). */
function mediaIds(qc: Kysely<Database>, op: "=" | "<>", projectId: string) {
  return qc
    .selectFrom("tickets")
    .select("screenshot_id as media_id")
    .where("project_id", op, projectId)
    .where("screenshot_id", "is not", null)
    .$narrowType<{ media_id: string }>()
    .union(
      qc.selectFrom("tickets").select("recording_id as media_id").where("project_id", op, projectId).where("recording_id", "is not", null).$narrowType<{ media_id: string }>(),
    )
    .union(
      qc
        .selectFrom("task_message_images")
        .innerJoin("task_messages", "task_messages.id", "task_message_images.message_id")
        .innerJoin("tickets", "tickets.id", "task_messages.ticket_id")
        .select("task_message_images.media_id")
        .where("tickets.project_id", op, projectId),
    );
}
