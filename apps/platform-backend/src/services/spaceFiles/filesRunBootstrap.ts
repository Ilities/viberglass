import type { JobBootstrapService } from "../job/JobBootstrapService";
import type { SpaceFilesRunService } from "./SpaceFilesRunService";

/** A Files run gets no repository, branch or SCM credential: its files come from the space. */
export function withoutRepository(bootstrap: Record<string, unknown>): void {
  for (const key of ["repository", "branch", "baseBranch", "scm", "taskBranch", "lastAgentCommit", "keptCommit"]) delete bootstrap[key];
}

/**
 * Queues a Files run for its space. When the space is free, the run's saved
 * bootstrap gains the files it starts from and this answers true; otherwise
 * the run waits for another to save, and its worker is started later.
 */
export async function claimSpaceFiles(
  files: Pick<SpaceFilesRunService, "enqueue" | "payloadFor">,
  bootstraps: Pick<JobBootstrapService, "saveBootstrapPayload">,
  run: { jobId: string; projectId: string; bootstrap: Record<string, unknown> },
): Promise<boolean> {
  const started = await files.enqueue(run.jobId, run.projectId);
  if (!started) return false;
  run.bootstrap.files = files.payloadFor(started);
  await bootstraps.saveBootstrapPayload(run.jobId, run.bootstrap);
  return true;
}
