import { sql } from "kysely";
import type { ArtifactOutput, OutputKind } from "@viberglass/types";
import db from "../config/database";
import { before, outputOrder, searchPattern, type OutputCursor, type OutputFilter } from "./outputQuery";

const ORDER = outputOrder("artifact_versions.created_at", "artifact:", "artifact_versions.id");

/** Which Outputs filter a version falls under; null for formats only All shows. */
const KIND = sql<Exclude<OutputKind, "app"> | null>`case
  when artifact_versions.format = 'html' and artifact_versions.cover->>'kind' = 'deck' then 'deck'
  when artifact_versions.format in ('markdown', 'text', 'html') then 'doc'
  when artifact_versions.format in ('csv', 'json') then 'data'
  when artifact_versions.format = 'pdf' then 'pdf'
  when artifact_versions.format in ('image', 'svg') then 'image'
end`;

/** Artifact versions, as Outputs lists them. */
export class ArtifactOutputsDAO {
  async list(filter: OutputFilter, cursor: OutputCursor | null, limit: number): Promise<ArtifactOutput[]> {
    if (filter.kind === "app") return [];
    let query = this.filtered(filter)
      .leftJoin("tickets", "tickets.id", "artifacts.ticket_id")
      .leftJoin("users", "users.id", "artifact_versions.created_by")
      .select([
        "artifact_versions.id as version_id",
        "artifact_versions.artifact_id",
        "artifact_versions.number",
        "artifact_versions.format",
        "artifact_versions.entrypoint",
        "artifact_versions.cover",
        "artifact_versions.job_id",
        "artifact_versions.created_at",
        "artifact_versions.unavailable_at",
        "artifacts.title",
        "artifacts.current_version_id",
        "artifacts.ticket_id",
        "tickets.task_key",
        "projects.id as project_id",
        "projects.slug as project_slug",
        "projects.name as project_name",
        "users.name as user_name",
      ])
      .select(KIND.as("kind"));
    if (filter.kind) query = query.where(KIND, "=", filter.kind);
    if (cursor) query = query.where(before(ORDER, cursor));
    const rows = await query.orderBy(ORDER.at, "desc").orderBy(ORDER.id, "desc").limit(limit).execute();
    return rows.map((row) => ({
      type: "artifact",
      id: `artifact:${row.version_id}`,
      kind: row.kind,
      spaceId: row.project_id,
      spaceSlug: row.project_slug,
      spaceName: row.project_name,
      taskId: row.ticket_id,
      taskKey: row.task_key,
      createdAt: row.created_at.toISOString(),
      artifactId: row.artifact_id,
      versionId: row.version_id,
      title: row.title,
      number: row.number,
      format: row.format,
      entrypoint: row.entrypoint,
      cover: row.cover,
      current: row.current_version_id === row.version_id,
      expired: row.unavailable_at !== null,
      producedBy: row.job_id ? { kind: "agent" } : { kind: "person", name: row.user_name },
      imageUrl: null,
    }));
  }

  /** How many versions fall under each filter. */
  async countByKind(filter: OutputFilter): Promise<Array<{ kind: Exclude<OutputKind, "app"> | null; count: number }>> {
    const rows = await this.filtered({ ...filter, kind: undefined })
      .select(KIND.as("kind"))
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .groupBy(KIND)
      .execute();
    return rows.map((row) => ({ kind: row.kind, count: Number(row.count) }));
  }

  /** Versions made since then, and the spaces they were made in. */
  async madeSince(projectIds: string[] | null, since: Date): Promise<Array<{ projectId: string; count: number }>> {
    let query = db
      .selectFrom("artifact_versions")
      .innerJoin("artifacts", "artifacts.id", "artifact_versions.artifact_id")
      .select("artifacts.project_id")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("artifact_versions.created_at", ">", since)
      .groupBy("artifacts.project_id");
    if (projectIds) query = projectIds.length ? query.where("artifacts.project_id", "in", projectIds) : query.where(sql<boolean>`false`);
    return (await query.execute()).map((row) => ({ projectId: row.project_id, count: Number(row.count) }));
  }

  private filtered(filter: OutputFilter) {
    let query = db
      .selectFrom("artifact_versions")
      .innerJoin("artifacts", "artifacts.id", "artifact_versions.artifact_id")
      .innerJoin("projects", "projects.id", "artifacts.project_id");
    if (filter.projectIds) query = filter.projectIds.length ? query.where("projects.id", "in", filter.projectIds) : query.where(sql<boolean>`false`);
    if (filter.spaceId) query = query.where("projects.id", "=", filter.spaceId);
    if (filter.producer === "agent") query = query.where("artifact_versions.job_id", "is not", null);
    if (filter.producer === "person") query = query.where("artifact_versions.job_id", "is", null);
    if (filter.latest) query = query.whereRef("artifacts.current_version_id", "=", "artifact_versions.id");
    if (filter.q) {
      const pattern = searchPattern(filter.q);
      query = query.where((eb) => eb.or([eb("artifacts.title", "ilike", pattern), eb("projects.name", "ilike", pattern)]));
    }
    return query;
  }
}
