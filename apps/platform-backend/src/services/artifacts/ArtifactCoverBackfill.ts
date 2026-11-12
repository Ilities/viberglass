import type { Readable } from "stream";
import { createChildLogger } from "../../config/logger";
import { ArtifactCoverDAO } from "../../persistence/artifacts/ArtifactCoverDAO";
import { objectUrlUnder, S3SpaceFilesStore, type SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";
import { artifactCover, COVER_READ_BYTES } from "./artifactCover";

const logger = createChildLogger({ service: "ArtifactCoverBackfill" });
const BATCH = 50;

/** Reads at most `limit` bytes and stops, so a large file costs no more than a small one. */
async function readStart(stream: Readable, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    bytes += buffer.length;
    if (bytes > limit) break;
  }
  stream.destroy();
  return Buffer.concat(chunks);
}

/**
 * Gives versions saved before covers existed their cover, once, from their
 * entry file in storage. Versions saved since get theirs when they're saved.
 */
export class ArtifactCoverBackfill {
  constructor(
    private readonly versions: Pick<ArtifactCoverDAO, "listMissing" | "setCover"> = new ArtifactCoverDAO(),
    private readonly store: Pick<SpaceFilesStore, "open"> = new S3SpaceFilesStore(),
  ) {}

  /** How many versions got a cover. A version that can't be read is skipped and tried again on the next start. */
  async run(): Promise<number> {
    let covered = 0;
    let after: string | null = null;
    for (;;) {
      const batch = await this.versions.listMissing(after, BATCH);
      for (const version of batch) {
        try {
          const content = await readStart(await this.store.open(objectUrlUnder(version.storagePrefix, version.entrypoint)), COVER_READ_BYTES);
          const cover = artifactCover(version.format, content);
          if (cover) {
            await this.versions.setCover(version.id, cover);
            covered++;
          }
        } catch (error) {
          logger.warn("Couldn't read an artifact version's cover", { versionId: version.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (batch.length < BATCH) return covered;
      after = batch[batch.length - 1].id;
    }
  }
}
