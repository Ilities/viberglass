import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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
import {
  captureAndStore,
  retrieveAndRestore,
} from "../runtime/SessionStateManager";

const DOCUMENT_FILES: Record<string, string> = {
  research: "RESEARCH.md",
  planning: "PLAN.md",
};

/**
 * Determine the effective session mode.
 * Uses explicit sessionMode when set (session-backed jobs), otherwise falls back
 * to jobKind for one-shot jobs routed here from ViberatorWorker.
 */
function effectiveSessionMode(
  params: JobRunnerParams,
): "research" | "planning" | "execution" | undefined {
  if (params.sessionMode) return params.sessionMode;
  const kind = params.data.jobKind;
  if (kind === "research" || kind === "planning" || kind === "execution") {
    return kind;
  }
  return undefined;
}

function buildSessionPromptOverride(params: JobRunnerParams): string {
  const { data } = params;
  const mode = effectiveSessionMode(params);

  // For continuation turns with ACP session, data.task already contains the
  // enriched revision template output (rendered by platform-backend).
  // This already includes Ticket Information, Research/Planning documents,
  // User Revision Message, and Inline Comments.
  // We only append current documents if they're NOT already in data.task
  // to avoid duplication while ensuring the agent has the very latest version.
  let prompt = data.task;

  if (mode === "research" && data.context?.researchDocument?.trim()) {
    if (!prompt.includes(data.context.researchDocument.trim())) {
      prompt += `\n\nCurrent Research Document (revise this):\n${data.context.researchDocument}`;
    }
  }

  if (mode === "planning") {
    if (
      data.context?.researchDocument?.trim() &&
      !prompt.includes(data.context.researchDocument.trim())
    ) {
      prompt += `\n\nApproved Research Document:\n${data.context.researchDocument}`;
    }
    if (
      data.context?.planDocument?.trim() &&
      !prompt.includes(data.context.planDocument.trim())
    ) {
      prompt += `\n\nCurrent Planning Document (revise this):\n${data.context.planDocument}`;
    }
  }

  return prompt;
}

/**
 * Run the branch/commit/PR flow for completed execution turns.
 * Extracted from the old runCodingJob — reused here for execution sessions
 * and one-shot execution jobs.
 */
async function completeExecutionWithPR(
  params: JobRunnerParams,
  repoDir: string,
  checkoutBaseBranch: string,
  executionContext: ExecutionContext,
): Promise<
  Pick<JobResult, "branch" | "pullRequestUrl" | "commitHash" | "changedFiles">
> {
  const { data, gitService, sendProgress } = params;
  const { id, repository, task, context, scm } = data;

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
    branch: featureBranch,
    pullRequestUrl,
    commitHash,
    changedFiles,
  };
}

export async function runSessionTurnJob(
  params: JobRunnerParams,
): Promise<JobResult> {
  return withJobLifecycle(params, "Session turn", async () => {
    const { data, callbackClient, sendProgress, logger } = params;
    const mode = effectiveSessionMode(params);
    const isOneShot = !params.agentSessionId;

    params.sessionEventForwarder?.setupForJob(data.id, data.tenantId);

    const setup = await setupJob(params, "session-turn");
    const { repoDir, checkoutBaseBranch, mergedSettings } = setup;

    // Restore conversation state before agent execution (continuation turns)
    if (params.conversationStateUrl) {
      await sendProgress("restore-state", "Restoring conversation state");
      try {
        await retrieveAndRestore(
          params.conversationStateUrl,
          os.homedir(),
          logger,
        );
        logger.info("Conversation state restored from previous turn", {
          conversationStateUrl: params.conversationStateUrl,
        });
      } catch (err) {
        logger.warn(
          "Failed to restore conversation state, continuing with fresh session",
          {
            conversationStateUrl: params.conversationStateUrl,
            error: err instanceof Error ? err.message : String(err),
          },
        );
      }
    }

    const promptOverride = buildSessionPromptOverride(params);

    // Build execution context — for execution mode, enrich with full ticket context
    // and apply overrides, matching the old runCodingJob behavior.
    const isExecution = mode === "execution";

    let fullTask = data.task;
    if (isExecution && params.overrides?.additionalContext) {
      fullTask += `\n\nAdditional Context:\n${params.overrides.additionalContext}`;
    }

    const executionContext: ExecutionContext = {
      repoUrl: data.repository,
      branch: checkoutBaseBranch,
      baseBranch: checkoutBaseBranch,
      repoDir,
      commitHash: "",
      jobKind: data.jobKind,
      bugDescription: isExecution ? fullTask : data.task,
      stepsToReproduce: isExecution
        ? params.overrides?.reproductionSteps ||
          data.context?.stepsToReproduce ||
          ""
        : "",
      expectedBehavior: isExecution
        ? params.overrides?.expectedBehavior ||
          data.context?.expectedBehavior ||
          ""
        : "",
      actualBehavior: isExecution ? data.context?.actualBehavior || "" : "",
      stackTrace: isExecution ? data.context?.stackTrace : undefined,
      consoleErrors: isExecution ? data.context?.consoleErrors || [] : [],
      affectedFiles: isExecution ? data.context?.affectedFiles || [] : [],
      ticketMedia: isExecution ? data.context?.ticketMedia || [] : [],
      researchDocument: isExecution
        ? data.context?.researchDocument
        : undefined,
      planDocument: isExecution ? data.context?.planDocument : undefined,
      maxChanges: mergedSettings.maxChanges,
      testRequired: isExecution ? mergedSettings.testRequired : false,
      codingStandards: isExecution ? mergedSettings.codingStandards : undefined,
      runTests: isExecution ? mergedSettings.runTests : false,
      testCommand: isExecution ? mergedSettings.testCommand : undefined,
      maxExecutionTime: mergedSettings.maxExecutionTime,
      promptOverride: isExecution ? fullTask : promptOverride,
      agentSessionId: params.agentSessionId,
      acpSessionId: params.acpSessionId,
      onAcpEvent: (event) => params.sessionEventForwarder?.enqueue(event),
    };

    await sendProgress("execute", "Running ACP agent turn");
    const result = await executeAgentWithRetry(params, executionContext);

    await params.sessionEventForwarder?.flush();

    if (result.newAcpSessionId) {
      await callbackClient.sendAcpSessionId(
        data.id,
        data.tenantId,
        result.newAcpSessionId,
      );
    }

    // Capture conversation state after successful execution for future turns
    let conversationStateUrl: string | undefined;
    if (result.newAcpSessionId) {
      logger.info("New ACP session established, capturing conversation state", {
        jobId: data.id,
        agentSessionId: params.agentSessionId,
        newAcpSessionId: result.newAcpSessionId,
        agent: executionContext.agent,
        homeDir: os.homedir(),
      });
      try {
        const url = await captureAndStore(
          executionContext.agent || "",
          params.agentSessionId || data.id,
          os.homedir(),
          logger,
        );
        if (url) {
          conversationStateUrl = url;
          logger.info("Conversation state captured and stored", {
            jobId: data.id,
            conversationStateUrl: url,
          });
          await callbackClient.sendConversationStateUrl(
            data.id,
            data.tenantId,
            url,
          );
        } else {
          logger.warn(
            "captureAndStore returned undefined - no state to archive or storage failed",
            {
              jobId: data.id,
              agent: executionContext.agent,
            },
          );
        }
      } catch (err) {
        logger.warn("Failed to capture conversation state", {
          jobId: data.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      logger.debug("No new ACP session - skipping conversation state capture", {
        jobId: data.id,
        agentSessionId: params.agentSessionId,
        acpTurnOutcome: result.acpTurnOutcome,
      });
    }

    // ── Execution completion: create branch / commit / PR ──
    //
    // For execution sessions the PR flow runs only when the agent turn is
    // "completed" (not needs_input / needs_approval).  For one-shot execution
    // jobs (no agentSessionId) the agent always completes in one turn, so the
    // PR flow always runs.
    if (
      isExecution &&
      result.acpTurnOutcome !== "needs_input" &&
      result.acpTurnOutcome !== "needs_approval"
    ) {
      const prResult = await completeExecutionWithPR(
        params,
        repoDir,
        checkoutBaseBranch,
        executionContext,
      );

      return {
        success: true,
        executionTime: 0,
        conversationStateUrl,
        ...prResult,
      };
    }

    // ── Non-execution or in-progress execution turns ──
    const changedFiles = await params.gitService.getChangedFiles(repoDir);

    // For document modes (research/planning), read the generated document if present.
    // If the file exists the backend will save it and mark the session completed.
    // If not, the turn completes normally and the session stays active for follow-up.
    let documentContent: string | undefined;
    const documentFileName = mode ? DOCUMENT_FILES[mode] : undefined;
    if (documentFileName) {
      const documentPath = path.join(repoDir, documentFileName);
      if (fs.existsSync(documentPath)) {
        documentContent = fs.readFileSync(documentPath, "utf-8");
      }
    }

    // For one-shot (non-session) research/planning jobs, the document must exist.
    // Session-backed jobs may produce the document across multiple turns.
    if (
      isOneShot &&
      (mode === "research" || mode === "planning") &&
      !documentContent
    ) {
      throw new Error(`${documentFileName} was not generated`);
    }

    return {
      success: true,
      changedFiles,
      executionTime: 0,
      documentContent,
      conversationStateUrl,
    };
  });
}
