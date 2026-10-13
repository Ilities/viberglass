import { createChildLogger } from "../../config/logger";
import type { SpaceFilesRunService } from "./SpaceFilesRunService";

const logger = createChildLogger({ service: "stopSpaceFiles" });

/** Lets a stopped job's worker save its Files space, then free it; best effort, since the sweeper retries what this misses. */
export async function stopSpaceFiles(files: Pick<SpaceFilesRunService, "stop">, jobId: string): Promise<void> {
  try {
    await files.stop(jobId);
  } catch (error) {
    logger.warn("Could not end a stopped job's hold on its Files space", {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
