import { createChildLogger } from "../../config/logger";
import { ArtifactDAO } from "../../persistence/artifacts/ArtifactDAO";
import { SpaceFilesDAO } from "../../persistence/spaceFiles/SpaceFilesDAO";
import { S3SpaceFilesStore, type SpaceFilesStore } from "./SpaceFilesStore";

const logger = createChildLogger({ service: "SpaceFilesRetention" });

/** Longer than any storage grant or preview fetch already under way when something is retired. */
export const PURGE_GRACE_MS = 15 * 60_000;

export interface RetentionCounts {
  /** Working snapshots each space keeps, newest first. */
  snapshots: number;
  /** Versions each artifact keeps, newest first. */
  versions: number;
}

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function retentionCounts(env: Record<string, string | undefined> = process.env): RetentionCounts {
  return {
    snapshots: positive(env.SPACE_FILES_KEEP_SNAPSHOTS, 20),
    versions: positive(env.ARTIFACT_KEEP_VERSIONS, 10),
  };
}

/**
 * Keeps the latest snapshots and artifact versions and deletes the rest from
 * storage. Retiring first stops new previews and grants; the bytes go after a
 * grace period. Rows stay, so threads and publications can still name what
 * was purged. A failed deletion is tried again on the next sweep.
 */
export class SpaceFilesRetention {
  constructor(
    private readonly snapshots: Pick<
      SpaceFilesDAO,
      "listSnapshotsToRetire" | "markSnapshotsUnavailable" | "listSnapshotsToPurge" | "markSnapshotPurged"
    > = new SpaceFilesDAO(),
    private readonly versions: Pick<ArtifactDAO, "listVersionsToRetire" | "markUnavailable" | "listVersionsToPurge" | "markPurged"> = new ArtifactDAO(),
    private readonly store: Pick<SpaceFilesStore, "delete"> = new S3SpaceFilesStore(),
    private readonly counts: RetentionCounts = retentionCounts(),
    private readonly graceMs = PURGE_GRACE_MS,
  ) {}

  async sweep(): Promise<number> {
    const retiredSnapshots = await this.snapshots.listSnapshotsToRetire(this.counts.snapshots);
    await this.snapshots.markSnapshotsUnavailable(retiredSnapshots);
    const retiredVersions = await this.versions.listVersionsToRetire(this.counts.versions);
    await this.versions.markUnavailable(retiredVersions);

    let purged = 0;
    for (const snapshot of await this.snapshots.listSnapshotsToPurge(this.graceMs)) {
      if (await this.purge(snapshot.storageUrl, `snapshot ${snapshot.id}`)) {
        await this.snapshots.markSnapshotPurged(snapshot.id);
        purged++;
      }
    }
    for (const version of await this.versions.listVersionsToPurge(this.graceMs)) {
      if (await this.purge(version.storagePrefix, `artifact version ${version.id}`)) {
        await this.versions.markPurged(version.id);
        purged++;
      }
    }
    return retiredSnapshots.length + retiredVersions.length + purged;
  }

  private async purge(storageUrl: string, what: string): Promise<boolean> {
    try {
      await this.store.delete(storageUrl);
      return true;
    } catch (error) {
      logger.warn(`Could not delete ${what}; trying again next sweep`, { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}
