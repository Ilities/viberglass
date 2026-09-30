import { buildFeatureBranchName, isObjectRecord, JOB_FAILURE_CODE } from "@viberglass/types";
import { failingWith } from "./JobFailureError";
import type { JobRunnerParams } from "./jobPipeline";

/** The branch an execution run commits to. */
export interface TaskBranch {
  name: string;
  /** True when the branch existed on origin and the run started from it. */
  continued: boolean;
}

/**
 * Checks out the task's branch when an earlier build pushed it, so this build
 * adds commits to the same branch and pull request instead of starting again
 * from the base branch. Named once here: a template with `{{ timestamp }}`
 * would render differently if named again at push time.
 */
export async function prepareTaskBranch(
  params: JobRunnerParams,
  repoDir: string,
): Promise<TaskBranch> {
  const { data, clankerConfig } = params;
  const clankerId =
    isObjectRecord(clankerConfig) && typeof clankerConfig.clankerId === "string"
      ? clankerConfig.clankerId
      : undefined;
  const name = buildFeatureBranchName(
    data.id,
    data.context?.ticketId,
    data.context?.originalTicketId,
    clankerId,
    data.scm?.branchNameTemplate,
  );

  const continued = await failingWith(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED, () =>
    params.gitService.checkoutRemoteBranch(repoDir, name, params.scmToken),
  );
  return { name, continued };
}
