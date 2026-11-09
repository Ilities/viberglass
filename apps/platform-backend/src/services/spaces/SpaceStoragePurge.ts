import type { SpaceHoldings } from "../../persistence/project/SpaceDeletionDAO";
import type { FileUploadService } from "../FileUploadService";
import { spaceObjectsPrefix, type SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";

const PARALLEL_PREFIXES = 8;

/** Erases what a space, its tasks, sessions and runs keep in object storage. */
export class SpaceStoragePurge {
  constructor(
    private readonly storage: Pick<SpaceFilesStore, "delete">,
    private readonly media: Pick<FileUploadService, "deleteFileByStorageUrl">,
    private readonly bucket: () => string,
  ) {}

  async purge(projectId: string, holdings: SpaceHoldings): Promise<void> {
    for (const media of holdings.media) await this.media.deleteFileByStorageUrl(media.url);
    const bucket = this.bucket();
    if (!bucket) return;
    const prefixes = storagePrefixes(bucket, projectId, holdings);
    for (let start = 0; start < prefixes.length; start += PARALLEL_PREFIXES) {
      await Promise.all(prefixes.slice(start, start + PARALLEL_PREFIXES).map((prefix) => this.storage.delete(prefix)));
    }
  }
}

function storagePrefixes(bucket: string, projectId: string, holdings: SpaceHoldings): string[] {
  const at = (...parts: string[]) => `s3://${bucket}/${parts.map(encodeURIComponent).join("/")}/`;
  return [
    spaceObjectsPrefix(bucket, projectId),
    ...holdings.taskIds.map((id) => at("ticket-phase-docs", id)),
    ...holdings.sessionIds.map((id) => at("conversation-state", id)),
    ...holdings.runIds.flatMap((id) => [at("jobs", id), at("conversation-state", id)]),
  ];
}
