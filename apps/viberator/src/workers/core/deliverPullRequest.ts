import { JOB_FAILURE_CODE } from "@viberglass/types";
import {
  ATTR_VG_BASE_BRANCH,
  ATTR_VG_BRANCH,
  ATTR_VG_CHANGED_FILE_COUNT,
  ATTR_VG_COMMIT_SHA,
  ATTR_VG_PULL_REQUEST_URL,
  ATTR_VG_REPOSITORY,
  definedAttributes,
  SpanKind,
  withSpan,
} from "@viberglass/telemetry";
import type { JobResult } from "./types";
import { failingWith } from "./JobFailureError";
import type { JobRunnerParams } from "./jobPipeline";
import { resolvePullRequestDescription, resolvePullRequestTitle } from "./pullRequestContent";
import type { TaskBranch } from "./taskBranch";

export interface DeliveryInput {
  repoDir: string;
  checkoutBaseBranch: string;
  changedFiles: string[];
  testsWereRequested: boolean;
  /** The task's branch, checked out at setup when an earlier build pushed it. */
  taskBranch: TaskBranch;
}

/** Commits the turn's code changes to the task's branch, pushes it, and opens or finds its pull request. */
export async function deliverPullRequest(
  params: JobRunnerParams,
  input: DeliveryInput,
): Promise<Pick<JobResult, "branch" | "pullRequestUrl" | "commitHash" | "changedFiles">> {
  const { data, gitService, sendProgress } = params;
  const { repository, task, context, scm } = data;
  const { repoDir, changedFiles } = input;

  const pullRequestBaseBranch = scm?.pullRequestBaseBranch?.trim() || input.checkoutBaseBranch;
  const pullRequestRepository = scm?.pullRequestRepository?.trim() || scm?.sourceRepository?.trim() || repository;

  const branch = input.taskBranch;
  if (!branch.continued) {
    await sendProgress("branch", "Creating feature branch");
    await gitService.createBranch(repoDir, branch.name);
  }

  const ticket = { title: context?.ticketTitle, description: context?.ticketDescription };
  const title = resolvePullRequestTitle(repoDir, task, ticket);
  const description = resolvePullRequestDescription({
    repoDir,
    task,
    ticket,
    changedFiles,
    testsWereRequested: input.testsWereRequested,
  });

  await sendProgress("commit", "Committing changes");
  const commitHash = await withSpan(
    "git.commit",
    { attributes: definedAttributes({ [ATTR_VG_BRANCH]: branch.name, [ATTR_VG_CHANGED_FILE_COUNT]: changedFiles.length }) },
    async () => gitService.commitChanges(repoDir, title),
  );

  await sendProgress("push", "Pushing branch to remote");
  await withSpan(
    "git.push",
    { attributes: definedAttributes({ [ATTR_VG_BRANCH]: branch.name, [ATTR_VG_COMMIT_SHA]: commitHash }) },
    async () =>
      failingWith(JOB_FAILURE_CODE.REPOSITORY_WRITE_FAILED, () => gitService.pushBranch(repoDir, branch.name, params.scmToken)),
  );

  await sendProgress("pr", "Creating pull request");
  const pullRequestUrl = await withSpan(
    "scm.create_pull_request",
    {
      kind: SpanKind.CLIENT,
      attributes: definedAttributes({
        [ATTR_VG_BRANCH]: branch.name,
        [ATTR_VG_BASE_BRANCH]: pullRequestBaseBranch,
        [ATTR_VG_REPOSITORY]: pullRequestRepository,
      }),
    },
    async (span) => {
      const url = await failingWith(JOB_FAILURE_CODE.REPOSITORY_WRITE_FAILED, () =>
        gitService.createPullRequest(
          repoDir,
          branch.name,
          pullRequestBaseBranch,
          title,
          description,
          {
            sourceRepositoryUrl: scm?.sourceRepository || repository,
            destinationRepositoryUrl: pullRequestRepository,
          },
          params.scmToken,
        ),
      );
      if (url) span.setAttribute(ATTR_VG_PULL_REQUEST_URL, url);
      return url;
    },
  );

  return { branch: branch.name, pullRequestUrl, commitHash, changedFiles };
}
