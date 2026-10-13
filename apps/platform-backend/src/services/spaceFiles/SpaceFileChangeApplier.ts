import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import type { SpaceFilesManifestEntry, SpaceFilesSnapshotSummary } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import { SpaceFilesDAO, type SpaceFileSnapshot } from "../../persistence/spaceFiles/SpaceFilesDAO";
import { ArtifactRegistrar } from "../artifacts/ArtifactRegistrar";
import { compareManifests, inspectSpaceArchive } from "./inspectSpaceArchive";
import { openFile, repackArchive, type SpaceFileChange } from "./spaceArchiveFiles";
import { S3SpaceFilesStore, snapshotStorageUrl, type SpaceFilesStore } from "./SpaceFilesStore";

const logger = createChildLogger({ service: "SpaceFileChangeApplier" });

/** How long a person's change may hold the space; it's one upload or save. */
const OPERATION_LEASE_MS = 2 * 60_000;

/**
 * Saves one person's change as the space's next files while holding the
 * space like a run does, so it never overwrites a run's work or another
 * person's. `check` sees the current files first and throws to refuse.
 */
export class SpaceFileChangeApplier {
  constructor(
    private readonly dao: Pick<SpaceFilesDAO, "acquireForOperation" | "getSnapshot" | "commitOperation" | "releaseOperation"> = new SpaceFilesDAO(),
    private readonly store: SpaceFilesStore = new S3SpaceFilesStore(),
    private readonly registrar: Pick<ArtifactRegistrar, "fromEdit" | "storeFiles"> = new ArtifactRegistrar(store),
  ) {}

  /** The saved files, or null when the space is busy and nothing was done. */
  async tryApply(
    projectId: string,
    userId: string | null,
    change: SpaceFileChange,
    check?: (files: SpaceFilesManifestEntry[]) => void,
  ): Promise<SpaceFilesSnapshotSummary | null> {
    const operationId = randomUUID();
    const lease = await this.dao.acquireForOperation(projectId, operationId, OPERATION_LEASE_MS);
    if (!lease) return null;
    let repacked: Awaited<ReturnType<typeof repackArchive>> | null = null;
    let uploaded: string | null = null;
    try {
      const current = lease.currentSnapshotId ? await this.dao.getSnapshot(lease.currentSnapshotId) : null;
      check?.(current?.manifest ?? []);
      repacked = await repackArchive(current ? await this.store.open(current.storageUrl) : null, change);
      const archivePath = repacked.archivePath;
      const archive = await inspectSpaceArchive(openFile(archivePath));
      const snapshotId = randomUUID();
      const storageUrl = snapshotStorageUrl(this.store.bucket(), projectId, snapshotId);
      await this.store.put(storageUrl, await fs.readFile(archivePath), archive.archiveBytes, "application/gzip");
      uploaded = storageUrl;

      const source = { projectId, ticketId: null, jobId: null, createdBy: userId, snapshotId };
      const versions = change.kind === "write" ? await this.registrar.fromEdit(change.path, archive.manifest, source) : [];
      await this.registrar.storeFiles(async () => openFile(archivePath), versions);

      const committed = await this.dao.commitOperation(
        operationId,
        lease.token,
        {
          id: snapshotId,
          projectId,
          parentId: current?.id ?? null,
          jobId: null,
          createdBy: userId,
          storageUrl,
          archiveSha256: archive.sha256,
          archiveBytes: archive.archiveBytes,
          totalBytes: archive.totalBytes,
          manifest: archive.manifest,
          changes: compareManifests(current?.manifest ?? [], archive.manifest),
          partial: false,
        },
        versions,
      );
      // Saving outlasted the lease and someone else holds the space now; the change waits like any other.
      if (committed === "lease_lost") return null;
      uploaded = null;
      logger.info("Saved a person's change to a Files space", { projectId, userId, kind: change.kind, path: change.path, artifacts: committed.artifacts.length });
      return summaryOf(committed.snapshot);
    } finally {
      await this.dao.releaseOperation(projectId, operationId);
      await repacked?.cleanup();
      if (uploaded) await this.discard(uploaded);
    }
  }

  /** An archive that never became the space's files; the orphan sweep deletes what this misses. */
  private async discard(storageUrl: string): Promise<void> {
    try {
      await this.store.delete(storageUrl);
    } catch (error) {
      logger.warn("Could not delete an unsaved archive", { storageUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export function summaryOf(snapshot: SpaceFileSnapshot): SpaceFilesSnapshotSummary {
  return {
    id: snapshot.id,
    parentId: snapshot.parentId,
    fileCount: snapshot.fileCount,
    totalBytes: snapshot.totalBytes,
    partial: snapshot.partial,
    changes: snapshot.changes,
    createdAt: snapshot.createdAt,
  };
}
