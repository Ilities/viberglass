import type { ArtifactCover, ArtifactFormat } from "@viberglass/types";
import db from "../config/database";

/** Formats a cover is read from; images are their own cover. */
const COVERED_FORMATS: ArtifactFormat[] = ["html", "markdown", "text", "csv", "json"];

export interface VersionMissingCover {
  id: string;
  format: ArtifactFormat;
  entrypoint: string;
  storagePrefix: string;
}

/** Versions still kept that were saved without a cover. */
export class ArtifactCoverDAO {
  async listMissing(afterId: string | null, limit: number): Promise<VersionMissingCover[]> {
    let query = db
      .selectFrom("artifact_versions")
      .select(["id", "format", "entrypoint", "storage_prefix"])
      .where("cover", "is", null)
      .where("unavailable_at", "is", null)
      .where("format", "in", COVERED_FORMATS);
    if (afterId) query = query.where("id", ">", afterId);
    const rows = await query.orderBy("id").limit(limit).execute();
    return rows.map((row) => ({ id: row.id, format: row.format, entrypoint: row.entrypoint, storagePrefix: row.storage_prefix }));
  }

  async setCover(versionId: string, cover: ArtifactCover): Promise<void> {
    await db.updateTable("artifact_versions").set({ cover: JSON.stringify(cover) }).where("id", "=", versionId).where("cover", "is", null).execute();
  }
}
