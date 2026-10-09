import * as path from "path";
import type GitService from "../../services/GitService";
import * as fs from "fs";
import { Logger } from "winston";
import type { CallbackClient } from "../infrastructure/CallbackClient";
import type { GitAuth } from "../../services/gitAuth";

export async function sendWorkerProgress(
  client: CallbackClient,
  logger: Logger,
  jobId: string | undefined,
  tenantId: string | undefined,
  step: string,
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  if (!jobId || !tenantId) {
    return;
  }
  try {
    await client.sendProgress(jobId, tenantId, { step, message, details });
  } catch (error) {
    logger.warn("Failed to send progress update", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function cleanupJobWorkspace(logger: Logger, workDir: string): void {
  try {
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
      logger.info("Workspace cleaned up", { workDir });
    }
  } catch (error) {
    logger.warn("Failed to cleanup workspace", { workDir, error });
  }
}

/** Clones the repository into the workspace's `repo` folder, replacing whatever an earlier run left there. */
export async function cloneFreshRepository(
  git: Pick<GitService, "cloneRepository">,
  repository: string,
  branch: string,
  workDir: string,
  gitAuth?: GitAuth,
): Promise<string> {
  const repoDir = path.join(workDir, "repo");
  if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
  await git.cloneRepository(repository, branch, workDir, gitAuth);
  return repoDir;
}
