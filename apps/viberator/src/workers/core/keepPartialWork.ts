import type { Logger } from "winston";
import type GitService from "../../services/GitService";
import type { TurnCallbackClient } from "../infrastructure/TurnCallbackClient";
import type { TaskBranch } from "./taskBranch";
import { collectArtifacts, type ArtifactSnapshot } from "./turnArtifacts";
import { listCodeChanges, restoreArtifactFiles } from "./workingTreeChanges";
import type { GitAuth } from "../../services/gitAuth";

export interface PartialWorkRun {
  jobId: string;
  tenantId: string;
  /** Only a build's code is kept; other turns' code changes would have been thrown away anyway. */
  allowCode: boolean;
  gitAuth?: GitAuth;
  git: Pick<GitService, "createBranch" | "commitChanges" | "pushBranch">;
  callbacks: Pick<TurnCallbackClient, "sendPartialResult">;
  logger: Pick<Logger, "info">;
}

export interface PartialWorkInput {
  repoDir: string;
  snapshot: ArtifactSnapshot;
  taskBranch: TaskBranch | undefined;
  /** A Files run saved its files first; the platform records them on the turn. */
  filesSaved?: boolean;
}

/**
 * What a stopped turn had done, kept rather than thrown away: the documents
 * it had written so far go to the platform, and on a build its code changes
 * become a work-in-progress commit on the task's branch, for the next turn,
 * or a person taking over, to carry on from.
 */
export async function keepPartialWork(run: PartialWorkRun, input: PartialWorkInput): Promise<void> {
  const documents = collectArtifacts(input.repoDir, input.snapshot);
  const code = await keepPartialCode(run, input.repoDir, input.taskBranch);
  if (Object.keys(documents).length === 0 && !code && !input.filesSaved) return;
  run.logger.info("Keeping what the stopped turn had done", { jobId: run.jobId, documents: Object.keys(documents), commitHash: code?.commitHash });
  await run.callbacks.sendPartialResult(run.jobId, run.tenantId, { documents, commitHash: code?.commitHash, branch: code?.branch });
}

export interface KeptCode {
  commitHash: string;
  branch: string;
}

/** A build's unfinished code changes as a work-in-progress commit pushed to the task's branch; null when there were none. */
export async function keepPartialCode(
  run: Pick<PartialWorkRun, "allowCode" | "gitAuth" | "git">,
  repoDir: string,
  taskBranch: TaskBranch | undefined,
): Promise<KeptCode | null> {
  if (!run.allowCode || !taskBranch) return null;
  await restoreArtifactFiles(repoDir);
  if ((await listCodeChanges(repoDir)).length === 0) return null;
  if (!taskBranch.continued) await run.git.createBranch(repoDir, taskBranch.name);
  const commitHash = await run.git.commitChanges(repoDir, "Work in progress: the run was stopped partway");
  await run.git.pushBranch(repoDir, taskBranch.name, run.gitAuth);
  return { commitHash, branch: taskBranch.name };
}
