import { sql } from "kysely";
import type { ArtifactCover, ArtifactFormat, OutputReleaseStatus, PinTarget } from "@viberglass/types";
import db from "../config/database";
import { releaseStatusOf } from "../outputs/ReleaseOutputsDAO";

export interface PinRow {
  id: string;
  target: PinTarget;
  /** As it was named when pinned. */
  title: string;
  /** As it's named now. */
  currentTitle: string;
  lastOpenedAt: Date | null;
  createdAt: Date;
  /** The space it's in; checked against what the person can see. */
  projectId: string;
  projectSlug: string;
  projectName: string;
  artifactVersion: { versionId: string; number: number; format: ArtifactFormat; cover: ArtifactCover | null; entrypoint: string; createdAt: Date } | null;
  release: { status: OutputReleaseStatus; commitSha: string; createdAt: Date } | null;
  appRunning: boolean;
}

interface ReleaseRow {
  id: string;
  status: "building" | "ready" | "failed";
  went_live_at: Date | null;
  rolled_back_at: Date | null;
  commit_sha: string;
  created_at: Date;
}

/** Each person's pins, in their order. */
export class PinsDAO {
  async list(userId: string): Promise<PinRow[]> {
    const rows = await db
      .selectFrom("user_pins")
      .leftJoin("artifacts", "artifacts.id", "user_pins.artifact_id")
      .leftJoin("artifact_versions", "artifact_versions.id", "artifacts.current_version_id")
      .innerJoin("projects", (join) => join.on(sql<boolean>`projects.id = coalesce(artifacts.project_id, user_pins.app_project_id)`))
      .leftJoin("apps", "apps.project_id", "user_pins.app_project_id")
      .select([
        "user_pins.id",
        "user_pins.artifact_id",
        "user_pins.app_project_id",
        "user_pins.title",
        "artifacts.title as artifact_title",
        "user_pins.last_opened_at",
        "user_pins.created_at",
        "projects.id as project_id",
        "projects.slug as project_slug",
        "projects.name as project_name",
        "artifact_versions.id as version_id",
        "artifact_versions.number",
        "artifact_versions.format",
        "artifact_versions.cover",
        "artifact_versions.entrypoint",
        "artifact_versions.created_at as version_created_at",
        "apps.current_release_id",
        "apps.state as app_state",
      ])
      .where("user_pins.user_id", "=", userId)
      .orderBy("user_pins.position")
      .orderBy("user_pins.created_at")
      .execute();
    const releases = await this.shownReleases(rows.flatMap((row) => (row.app_project_id ? [{ projectId: row.app_project_id, currentId: row.current_release_id }] : [])));
    return rows.map((row) => {
      const release = row.app_project_id ? releases.get(row.app_project_id) : undefined;
      return {
        id: row.id,
        target: row.artifact_id ? { kind: "artifact", artifactId: row.artifact_id } : { kind: "app", spaceId: row.app_project_id ?? row.project_id },
        title: row.title,
        currentTitle: row.artifact_title ?? row.project_name,
        lastOpenedAt: row.last_opened_at,
        createdAt: row.created_at,
        projectId: row.project_id,
        projectSlug: row.project_slug,
        projectName: row.project_name,
        artifactVersion:
          row.version_id && row.number !== null && row.format && row.entrypoint && row.version_created_at
            ? { versionId: row.version_id, number: row.number, format: row.format, cover: row.cover, entrypoint: row.entrypoint, createdAt: row.version_created_at }
            : null,
        release: release
          ? { status: releaseStatusOf({ ...release, current_release_id: row.current_release_id }), commitSha: release.commit_sha, createdAt: release.created_at }
          : null,
        appRunning: row.app_state === "running",
      };
    });
  }

  /** Pins it after the person's other pins; pinning it again changes nothing. */
  async add(userId: string, target: PinTarget, title: string): Promise<void> {
    await db
      .insertInto("user_pins")
      .values({
        user_id: userId,
        artifact_id: target.kind === "artifact" ? target.artifactId : null,
        app_project_id: target.kind === "app" ? target.spaceId : null,
        title,
        position: sql<number>`(select coalesce(max(position) + 1, 0) from user_pins where user_id = ${userId})`,
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  }

  async remove(userId: string, pinId: string): Promise<void> {
    await db.deleteFrom("user_pins").where("user_id", "=", userId).where("id", "=", pinId).execute();
  }

  /** Puts the named pins first, in this order; pins not named keep their order after them. */
  async reorder(userId: string, pinIds: string[]): Promise<void> {
    await db.transaction().execute(async (trx) => {
      const current = await trx.selectFrom("user_pins").select("id").where("user_id", "=", userId).orderBy("position").orderBy("created_at").forUpdate().execute();
      const named = pinIds.filter((id) => current.some((pin) => pin.id === id));
      const order = [...new Set(named), ...current.map((pin) => pin.id).filter((id) => !named.includes(id))];
      for (const [position, id] of order.entries()) {
        await trx.updateTable("user_pins").set({ position }).where("id", "=", id).execute();
      }
    });
  }

  async markOpened(userId: string, target: PinTarget, at: Date): Promise<void> {
    let query = db.updateTable("user_pins").set({ last_opened_at: at }).where("user_id", "=", userId);
    query = target.kind === "artifact" ? query.where("artifact_id", "=", target.artifactId) : query.where("app_project_id", "=", target.spaceId);
    await query.execute();
  }

  /** What a target is called and where it lives, or null when it doesn't exist or can't be pinned. */
  async describe(target: PinTarget): Promise<{ title: string; projectId: string } | null> {
    if (target.kind === "artifact") {
      const row = await db.selectFrom("artifacts").select(["title", "project_id"]).where("id", "=", target.artifactId).executeTakeFirst();
      return row ? { title: row.title, projectId: row.project_id } : null;
    }
    const row = await db.selectFrom("projects").select(["name", "id"]).where("id", "=", target.spaceId).where("backing_kind", "=", "app").executeTakeFirst();
    return row ? { title: row.name, projectId: row.id } : null;
  }

  /** The release an app pin shows: the one serving now, or the newest when none is. */
  private async shownReleases(apps: Array<{ projectId: string; currentId: string | null }>) {
    if (apps.length === 0) return new Map<string, ReleaseRow>();
    const select = db.selectFrom("app_releases").select(["project_id", "id", "status", "went_live_at", "rolled_back_at", "commit_sha", "created_at"]);
    const currentIds = apps.flatMap((app) => (app.currentId ? [app.currentId] : []));
    const [current, newest] = await Promise.all([
      currentIds.length ? select.where("id", "in", currentIds).execute() : Promise.resolve([]),
      select
        .distinctOn("project_id")
        .where("project_id", "in", apps.map((app) => app.projectId))
        .where("preview", "=", false)
        .orderBy("project_id")
        .orderBy("created_at", "desc")
        .execute(),
    ]);
    return new Map<string, ReleaseRow>([...newest, ...current].map((row) => [row.project_id, row]));
  }
}
