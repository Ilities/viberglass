import db from "../config/database";

/** What a Files space's stored objects belong to, so objects nothing refers to can be found. */
export class SpaceFileObjectsDAO {
  async listSpaces(): Promise<string[]> {
    const rows = await db.selectFrom("space_file_state").select("project_id").execute();
    return rows.map((row) => row.project_id);
  }

  /** Snapshots the space has, and checkpoints its waiting and running runs will save. */
  async listSnapshotIds(projectId: string): Promise<Set<string>> {
    const snapshots = await db.selectFrom("space_file_snapshots").select("id").where("project_id", "=", projectId).execute();
    const runs = await db
      .selectFrom("space_file_runs")
      .select("checkpoint_snapshot_id")
      .where("project_id", "=", projectId)
      .where("status", "in", ["waiting", "running"])
      .execute();
    return new Set([...snapshots.map((row) => row.id), ...runs.map((row) => row.checkpoint_snapshot_id)]);
  }

  /** Staged content the space's waiting and failed changes still need. */
  async listStagedUrls(projectId: string): Promise<Set<string>> {
    const rows = await db
      .selectFrom("space_file_changes")
      .select("staged_url")
      .where("project_id", "=", projectId)
      .where("status", "in", ["waiting", "failed"])
      .where("staged_url", "is not", null)
      .execute();
    return new Set(rows.flatMap((row) => (row.staged_url ? [row.staged_url] : [])));
  }
}
