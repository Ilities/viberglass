import { createChildLogger } from "../../config/logger";
import { SpaceFileObjectsDAO } from "../../persistence/spaceFiles/SpaceFileObjectsDAO";
import { S3SpaceFilesStore, spacePrefix, type SpaceFilesObjectListing } from "./SpaceFilesStore";

const logger = createChildLogger({ service: "SpaceFilesOrphanCleanup" });

/** How long an object nothing refers to is kept: a refused upload stays this long for diagnosis. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60_000;

/**
 * Deletes a Files space's stored objects that never became anything: uploads
 * of runs that were refused, cancelled or lost before saving, and content of
 * changes that were never recorded. Only objects older than the grace period
 * go, so nothing still being saved is touched.
 */
export class SpaceFilesOrphanCleanup {
  constructor(
    private readonly known: Pick<SpaceFileObjectsDAO, "listSpaces" | "listSnapshotIds" | "listStagedUrls"> = new SpaceFileObjectsDAO(),
    private readonly store: SpaceFilesObjectListing & { bucket(): string } = new S3SpaceFilesStore(),
    private readonly graceMs = ORPHAN_GRACE_MS,
  ) {}

  async sweep(now = Date.now()): Promise<number> {
    let deleted = 0;
    for (const projectId of await this.known.listSpaces()) {
      try {
        deleted += await this.sweepSpace(projectId, now);
      } catch (error) {
        logger.warn("Could not clean up a Files space's unused objects; trying again next sweep", {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return deleted;
  }

  private async sweepSpace(projectId: string, now: number): Promise<number> {
    const bucket = this.store.bucket();
    const snapshotIds = await this.known.listSnapshotIds(projectId);
    const stagedUrls = await this.known.listStagedUrls(projectId);
    const snapshots = spacePrefix(bucket, projectId, "snapshots");
    const changes = spacePrefix(bucket, projectId, "changes");
    const unused = [
      ...(await this.store.list(snapshots)).filter((object) => !snapshotIds.has(object.storageUrl.slice(snapshots.length).split("/")[0])),
      ...(await this.store.list(changes)).filter((object) => !stagedUrls.has(object.storageUrl)),
    ].filter((object) => object.lastModified !== null && now - object.lastModified.getTime() > this.graceMs);
    for (const object of unused) await this.store.delete(object.storageUrl);
    if (unused.length > 0) logger.info("Deleted a Files space's unused objects", { projectId, count: unused.length });
    return unused.length;
  }
}
