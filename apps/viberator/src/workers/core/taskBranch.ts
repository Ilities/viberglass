import { JOB_FAILURE_CODE } from "@viberglass/types";
import { failingWith } from "./JobFailureError";
import type { JobRunnerParams } from "./jobPipeline";

/** The branch a task's turns commit to. */
export interface TaskBranch {
  name: string;
  /** True when the branch existed on origin and the run started from it. */
  continued: boolean;
}

/**
 * Checks out the task's branch, named once by the platform, when an earlier
 * build pushed it, so this turn adds commits to the same branch and pull
 * request instead of starting again from the base branch.
 */
export async function prepareTaskBranch(params: JobRunnerParams, name: string, repoDir: string): Promise<TaskBranch> {
  const continued = await failingWith(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED, () =>
    params.gitService.checkoutRemoteBranch(repoDir, name, params.scmToken),
  );
  return { name, continued };
}
