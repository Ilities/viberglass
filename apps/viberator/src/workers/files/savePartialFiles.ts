import type { Logger } from "winston";
import { unmaterialize, type MaterializedFile } from "../runtime/InstructionFileManager";
import { saveFilesWorkspace, type FilesRun } from "./filesWorkspace";

/** Saves what a failed or stopped agent left in a Files space, marked partial; failing to is only logged. */
export async function savePartialFiles(
  files: FilesRun,
  repoDir: string,
  materialized: MaterializedFile[],
  logger: Pick<Logger, "warn">,
): Promise<boolean> {
  try {
    await unmaterialize(materialized);
    await saveFilesWorkspace(files, repoDir, { partial: true });
    return true;
  } catch (error) {
    logger.warn("Couldn't save the run's partial files", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
