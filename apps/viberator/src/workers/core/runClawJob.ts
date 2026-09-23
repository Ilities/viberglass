import { ExecutionContext } from "../../types";
import { JOB_FAILURE_CODE } from "@viberglass/types";
import { JobResult } from "./types";
import { failingWith, JobFailureError } from "./JobFailureError";
import { buildFeatureBranchName } from "../runtime/branchNaming";
import {
  resolvePullRequestDescription,
  resolvePullRequestTitle,
} from "./pullRequestContent";
import {
  JobRunnerParams,
  setupJob,
  executeAgentWithRetry,
  withJobLifecycle,
} from "./jobPipeline";
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

export async function runClawJob(
  params: JobRunnerParams,
): Promise<JobResult> {
  return withJobLifecycle(params, "Claw job", async () => {
    const { data, gitService, sendProgress } = params;
    const { id, repository, task, context, scm } = data;

    const setup = await setupJob(params, "claw");
    const { repoDir, checkoutBaseBranch, mergedSettings } = setup;

    const pullRequestBaseBranch =
      scm?.pullRequestBaseBranch?.trim() || checkoutBaseBranch;
    const pullRequestRepository =
      scm?.pullRequestRepository?.trim() ||
      scm?.sourceRepository?.trim() ||
      repository;

    await sendProgress("branch", "Creating feature branch");
    const featureBranch = buildFeatureBranchName(
      id,
      context?.ticketId,
      context?.originalTicketId,
      (params.clankerConfig as Record<string, unknown> | undefined)
        ?.clankerId as string,
      scm?.branchNameTemplate,
    );
    await gitService.createBranch(repoDir, featureBranch);

    let fullTask = task;
    if (params.overrides?.additionalContext) {
      fullTask += `\n\nAdditional Context:\n${params.overrides.additionalContext}`;
    }

    const executionContext: ExecutionContext = {
      repoUrl: repository,
      branch: featureBranch,
      baseBranch: checkoutBaseBranch,
      repoDir,
      commitHash: "",
      jobKind: data.jobKind,
      bugDescription: fullTask,
      stepsToReproduce:
        params.overrides?.reproductionSteps ||
        context?.stepsToReproduce ||
        "",
      expectedBehavior:
        params.overrides?.expectedBehavior ||
        context?.expectedBehavior ||
        "",
      actualBehavior: context?.actualBehavior || "",
      stackTrace: context?.stackTrace,
      consoleErrors: context?.consoleErrors || [],
      affectedFiles: context?.affectedFiles || [],
      ticketMedia: context?.ticketMedia || [],
      researchDocument: context?.researchDocument,
      planDocument: context?.planDocument,
      maxChanges: mergedSettings.maxChanges,
      testRequired: mergedSettings.testRequired,
      codingStandards: mergedSettings.codingStandards,
      runTests: mergedSettings.runTests,
      testCommand: mergedSettings.testCommand,
      maxExecutionTime: mergedSettings.maxExecutionTime,
      promptOverride: fullTask,
    };

    await executeAgentWithRetry(params, executionContext);

    const changedFiles = await gitService.getChangedFiles(repoDir);
    if (changedFiles.length === 0) {
      throw new JobFailureError(
        JOB_FAILURE_CODE.AGENT_NO_CHANGES,
        "No code changes detected after agent execution; pull request was not created",
      );
    }

    const pullRequestTitle = resolvePullRequestTitle(repoDir, task);
    const pullRequestDescription = resolvePullRequestDescription({
      repoDir,
      task,
      changedFiles,
      testsWereRequested: executionContext.runTests,
    });

    await sendProgress("commit", "Committing changes");
    const commitHash = await withSpan(
      "git.commit",
      {
        attributes: definedAttributes({
          [ATTR_VG_BRANCH]: featureBranch,
          [ATTR_VG_CHANGED_FILE_COUNT]: changedFiles.length,
        }),
      },
      async () => gitService.commitChanges(repoDir, task),
    );

    await sendProgress("push", "Pushing branch to remote");
    await withSpan(
      "git.push",
      {
        attributes: definedAttributes({
          [ATTR_VG_BRANCH]: featureBranch,
          [ATTR_VG_COMMIT_SHA]: commitHash,
        }),
      },
      async () =>
        failingWith(JOB_FAILURE_CODE.REPOSITORY_WRITE_FAILED, () =>
          gitService.pushBranch(repoDir, featureBranch, params.scmToken),
        ),
    );

    await sendProgress("pr", "Creating pull request");
    const pullRequestUrl = await withSpan(
      "scm.create_pull_request",
      {
        kind: SpanKind.CLIENT,
        attributes: definedAttributes({
          [ATTR_VG_BRANCH]: featureBranch,
          [ATTR_VG_BASE_BRANCH]: pullRequestBaseBranch,
          [ATTR_VG_REPOSITORY]: pullRequestRepository,
        }),
      },
      async (span) => {
        const url = await failingWith(JOB_FAILURE_CODE.REPOSITORY_WRITE_FAILED, () =>
          gitService.createPullRequest(
            repoDir,
            featureBranch,
            pullRequestBaseBranch,
            pullRequestTitle,
            pullRequestDescription,
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

    return {
      success: true,
      branch: featureBranch,
      pullRequestUrl,
      changedFiles,
      executionTime: 0, // overwritten by withJobLifecycle
      commitHash,
    };
  });
}
