import type { Selectable } from "kysely";
import type { AppPower, AppRunState } from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

type AppRow = Selectable<Database["apps"]>;

export interface AppRecord {
  projectId: string;
  power: AppPower;
  state: AppRunState;
  statusMessage: string | null;
  currentReleaseId: string | null;
  busySince: Date | null;
}

export type AppChange = Partial<Pick<AppRecord, "power" | "state" | "statusMessage" | "currentReleaseId">>;

export class AppDAO {
  async get(projectId: string): Promise<AppRecord | null> {
    const row = await db.selectFrom("apps").selectAll().where("project_id", "=", projectId).executeTakeFirst();
    return row ? toApp(row) : null;
  }

  /** An app is on from the start, so its first release goes live. */
  async ensure(projectId: string): Promise<AppRecord> {
    await db.insertInto("apps").values({ project_id: projectId }).onConflict((conflict) => conflict.column("project_id").doNothing()).execute();
    const app = await this.get(projectId);
    if (!app) throw new Error(`App for space ${projectId} disappeared`);
    return app;
  }

  /**
   * Marks the app busy for one start, stop or switch. Null when another is in
   * progress; one that began before `staleBefore` is taken to have died with its process.
   */
  async claim(projectId: string, staleBefore: Date): Promise<AppRecord | null> {
    const row = await db
      .updateTable("apps")
      .set({ busy_since: new Date() })
      .where("project_id", "=", projectId)
      .where((eb) => eb.or([eb("busy_since", "is", null), eb("busy_since", "<", staleBefore)]))
      .returningAll()
      .executeTakeFirst();
    return row ? toApp(row) : null;
  }

  async update(projectId: string, change: AppChange): Promise<void> {
    await db.updateTable("apps").set({ ...columns(change), updated_at: new Date() }).where("project_id", "=", projectId).execute();
  }

  /** Ends what `claim` began. */
  async finish(projectId: string, change: AppChange): Promise<void> {
    await db
      .updateTable("apps")
      .set({ ...columns(change), busy_since: null, updated_at: new Date() })
      .where("project_id", "=", projectId)
      .execute();
  }
}

function columns(change: AppChange): Partial<Pick<AppRow, "power" | "state" | "status_message" | "current_release_id">> {
  return {
    ...(change.power !== undefined ? { power: change.power } : {}),
    ...(change.state !== undefined ? { state: change.state } : {}),
    ...(change.statusMessage !== undefined ? { status_message: change.statusMessage } : {}),
    ...(change.currentReleaseId !== undefined ? { current_release_id: change.currentReleaseId } : {}),
  };
}

function toApp(row: AppRow): AppRecord {
  return {
    projectId: row.project_id,
    power: row.power,
    state: row.state,
    statusMessage: row.status_message,
    currentReleaseId: row.current_release_id,
    busySince: row.busy_since,
  };
}
