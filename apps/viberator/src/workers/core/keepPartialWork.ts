import type { Logger } from "winston";
import type GitService from "../../services/GitService";
import type { TurnCallbackClient } from "../infrastructure/TurnCallbackClient";
import type { TaskBranch } from "./taskBranch";
import { collectArtifacts, type ArtifactSnapshot } from "./turnArtifacts";
import { listCodeChanges, restoreArtifactFiles } from "./workingTreeChanges";

export interface PartialWorkRun {
  jobId: string;
  tenantId: string;
  /** Only a build's code is kept; other turns' code changes would have been thrown away anyway. */
  allowCode: boolean;
  scmToken?: string;
  git: Pick<GitService, "createBranch" | "commitChanges" | "pushBranch">;
  callbacks: Pick<TurnCallbackClient, "sendPartialResult">;
  logger: Pick<Logger, "info">;
}

export interface PartialWorkInput {
  repoDir: string;
  snapshot: ArtifactSnapshot;
  taskBranch: TaskBranch | undefined;
}

/**
 * What a stopped turn had done, kept rather than thrown away: the documents
 * it had written so far go to the platform, and on a build its code changes
 * become a work-in-progress commit on the task's branch, for the next turn,
 * or a person taking over, to carry on from.
 */
export async function keepPartialWork(run: PartialWorkRun, input: PartialWorkInput): Promise<void> {
  const documents = collectArtifacts(input.repoDir, input.snapshot);
  let commitHash: string | undefined;
  let branch: string | undefined;
  if (run.allowCode && input.taskBranch) {
    await restoreArtifactFiles(input.repoDir);
    if ((await listCodeChanges(input.repoDir)).length > 0) {
      if (!input.taskBranch.continued) await run.git.createBranch(input.repoDir, input.taskBranch.name);
      commitHash = await run.git.commitChanges(input.repoDir, "Work in progress: the run was stopped partway");
      await run.git.pushBranch(input.repoDir, input.taskBranch.name, run.scmToken);
      branch = input.taskBranch.name;
    }
  }
  if (Object.keys(documents).length === 0 && !commitHash) return;
  run.logger.info("Keeping what the stopped turn had done", { jobId: run.jobId, documents: Object.keys(documents), commitHash });
  await run.callbacks.sendPartialResult(run.jobId, run.tenantId, { documents, commitHash, branch });
}
