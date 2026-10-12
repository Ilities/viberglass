import { createChildLogger } from "../../config/logger";
import type { SpaceFilesRunService } from "./SpaceFilesRunService";

const logger = createChildLogger({ service: "releaseSpaceFiles" });

/** Frees a finished job's Files space; best effort, since the sweeper retries what this misses. */
export async function releaseSpaceFiles(files: Pick<SpaceFilesRunService, "release">, jobId: string): Promise<void> {
  try {
    await files.release(jobId);
  } catch (error) {
    logger.warn("Could not release a Files space after its job ended", {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
