import { ExecutionContext } from "../../types";
import { JobResult } from "./types";
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

export async function runCodingJob(
  params: JobRunnerParams,
): Promise<JobResult> {
  return withJobLifecycle(params, "Job", async () => {
    const { data, gitService, sendProgress } = params;
    const { id, repository, task, context, scm } = data;

    const setup = await setupJob(params, "coding");
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
    };

    await executeAgentWithRetry(params, executionContext);

    const changedFiles = await gitService.getChangedFiles(repoDir);
    if (changedFiles.length === 0) {
      throw new Error(
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
    const commitHash = await gitService.commitChanges(repoDir, task);

    await sendProgress("push", "Pushing branch to remote");
    await gitService.pushBranch(repoDir, featureBranch);

    await sendProgress("pr", "Creating pull request");
    const pullRequestUrl = await gitService.createPullRequest(
      repoDir,
      featureBranch,
      pullRequestBaseBranch,
      pullRequestTitle,
      pullRequestDescription,
      {
        sourceRepositoryUrl: scm?.sourceRepository || repository,
        destinationRepositoryUrl: pullRequestRepository,
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
