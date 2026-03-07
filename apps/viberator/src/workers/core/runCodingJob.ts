import * as fs from "fs";
import * as path from "path";
import { Logger } from "winston";
import { AgentConfig, ExecutionContext } from "../../types";
import GitService from "../../services/GitService";
import { AgentOrchestrator } from "../../orchestrator/AgentOrchestrator";
import {
  CodingJobData,
  JobOverrides,
  JobResult,
  ProjectConfigPayload,
} from "./types";
import { CallbackClient } from "../infrastructure/CallbackClient";
import { InstructionFileManager } from "../runtime/InstructionFileManager";
import { EnvironmentManager } from "../runtime/EnvironmentManager";
import { LogForwarder } from "../runtime/LogForwarder";
import { buildFeatureBranchName } from "../runtime/branchNaming";
import { mergeWorkerSettings } from "../runtime/workerSettings";
import {
  resolvePullRequestDescription,
  resolvePullRequestTitle,
} from "./pullRequestContent";
import type {
  AgentAuthContext,
  AgentAuthLifecycle,
} from "./agentAuthLifecycle";

interface RunCodingJobParams {
  data: CodingJobData;
  repositoryRoot: string;
  logger: Logger;
  gitService: GitService;
  callbackClient: CallbackClient;
  orchestrator: AgentOrchestrator;
  instructionFileManager: InstructionFileManager;
  instructionFiles: Map<string, string>;
  fetchedCredentials: Record<string, string | undefined>;
  clankerEnvironment?: Record<string, string>;
  clankerConfig?: Record<string, unknown>;
  projectConfig?: ProjectConfigPayload;
  overrides?: JobOverrides;
  agentAuthLifecycle: AgentAuthLifecycle;
  environmentManager: EnvironmentManager;
  logForwarder: LogForwarder;
  defaultTimeout: number;
  selectAgentForExecution: (availableAgents: AgentConfig[]) => AgentConfig;
  sendProgress: (
    step: string,
    message: string,
    details?: Record<string, unknown>,
  ) => Promise<void>;
  cloneRepositoryToWorkspace: (
    repository: string,
    branch: string,
    workDir: string,
  ) => Promise<string>;
  cleanupWorkspace: (workDir: string) => void;
}

export async function runCodingJob(
  params: RunCodingJobParams,
): Promise<JobResult> {
  const {
    data,
    repositoryRoot,
    logger,
    gitService,
    callbackClient,
    orchestrator,
    instructionFileManager,
    instructionFiles,
    fetchedCredentials,
    clankerEnvironment,
    clankerConfig,
    projectConfig,
    overrides,
    agentAuthLifecycle,
    environmentManager,
    logForwarder,
    defaultTimeout,
    selectAgentForExecution,
    sendProgress,
    cloneRepositoryToWorkspace,
    cleanupWorkspace,
  } = params;

  const startTime = Date.now();
  const { id, repository, task, baseBranch, context, settings, scm } = data;
  const checkoutBaseBranch = scm?.baseBranch?.trim() || baseBranch || "main";
  const pullRequestBaseBranch =
    scm?.pullRequestBaseBranch?.trim() || checkoutBaseBranch;
  const pullRequestRepository =
    scm?.pullRequestRepository?.trim() ||
    scm?.sourceRepository?.trim() ||
    repository;

  logForwarder.setupForJob(id, data.tenantId);

  logger.info("Processing task", { jobId: id, repository });
  await sendProgress("initialize", "Starting job execution");

  environmentManager.inject(fetchedCredentials, clankerEnvironment);

  try {
    const jobWorkDir = path.join(repositoryRoot, id);
    if (!fs.existsSync(jobWorkDir)) {
      fs.mkdirSync(jobWorkDir, { recursive: true });
    }

    await sendProgress("clone", "Cloning repository", { repository });
    logger.info("Cloning repository", { repository, jobWorkDir });
    const repoDir = await cloneRepositoryToWorkspace(
      repository,
      checkoutBaseBranch,
      jobWorkDir,
    );

    await sendProgress("branch", "Creating feature branch");
    const featureBranch = buildFeatureBranchName(
      id,
      context?.ticketId,
      context?.originalTicketId,
      clankerConfig?.clankerId as string,
      scm?.branchNameTemplate,
    );
    await gitService.createBranch(repoDir, featureBranch);

    if (instructionFiles.size > 0) {
      await sendProgress("instructions", "Applying instruction files", {
        count: instructionFiles.size,
      });
      await instructionFileManager.materialize(repoDir, instructionFiles);
    }

    const mergedSettings = mergeWorkerSettings({
      defaults: { maxExecutionTime: defaultTimeout },
      jobSettings: settings,
      clankerConfig,
      projectConfig,
      overrides,
    });

    let fullTask = task;
    if (overrides?.additionalContext) {
      fullTask += `\n\nAdditional Context:\n${overrides.additionalContext}`;
    }

    const stepsToReproduce =
      overrides?.reproductionSteps || context?.stepsToReproduce || "";
    const expectedBehavior =
      overrides?.expectedBehavior || context?.expectedBehavior || "";
    const ticketMedia = context?.ticketMedia || [];

    const executionContext: ExecutionContext = {
      repoUrl: repository,
      branch: featureBranch,
      baseBranch: checkoutBaseBranch,
      repoDir,
      commitHash: "",
      bugDescription: fullTask,
      stepsToReproduce,
      expectedBehavior,
      actualBehavior: context?.actualBehavior || "",
      stackTrace: context?.stackTrace,
      consoleErrors: context?.consoleErrors || [],
      affectedFiles: context?.affectedFiles || [],
      ticketMedia,
      researchDocument: context?.researchDocument,
      planDocument: context?.planDocument,
      maxChanges: mergedSettings.maxChanges,
      testRequired: mergedSettings.testRequired,
      codingStandards: mergedSettings.codingStandards,
      runTests: mergedSettings.runTests,
      testCommand: mergedSettings.testCommand,
      maxExecutionTime: mergedSettings.maxExecutionTime,
    };

    const availableAgents = orchestrator.getAvailableAgents();
    const selectedAgent = selectAgentForExecution(availableAgents);
    executionContext.agent = selectedAgent.name;
    const authContext: AgentAuthContext = {
      agentName: selectedAgent.name,
      jobId: id,
      tenantId: data.tenantId,
    };
    await agentAuthLifecycle.ensureReady(authContext);

    const executeSelectedAgent = () =>
      orchestrator.executeAgent(selectedAgent, executionContext);

    await sendProgress("execute", "Running AI agent", {
      agentName: selectedAgent.name,
    });
    logger.info("Agent selected", { agentName: selectedAgent.name });
    let result = await executeSelectedAgent();

    const shouldRetryWithFreshAuth = agentAuthLifecycle.shouldRetryAfterFailure(
      authContext,
      result,
    );

    if (shouldRetryWithFreshAuth) {
      logger.warn(
        "Agent execution failed due to auth; retrying after auth refresh",
        {
          jobId: id,
          tenantId: data.tenantId,
          agentName: selectedAgent.name,
          errorMessage: result.errorMessage,
        },
      );

      await sendProgress(
        "auth",
        "Agent auth failed, refreshing authentication",
        { agentName: selectedAgent.name },
      );
      await agentAuthLifecycle.refreshAfterFailure(authContext);

      await sendProgress("execute", "Retrying AI agent after auth refresh", {
        agentName: selectedAgent.name,
        retry: 1,
      });
      result = await executeSelectedAgent();
    }

    if (!result.success) {
      throw new Error(result.errorMessage || "Agent execution failed");
    }

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

    await sendProgress("cleanup", "Cleaning up workspace");
    cleanupWorkspace(jobWorkDir);

    const executionTime = Date.now() - startTime;
    logger.info("Task completed successfully", {
      jobId: id,
      executionTime,
      pullRequestUrl,
    });

    await sendProgress("complete", "Job completed successfully");
    logForwarder.flush();

    const workerResult: JobResult = {
      success: true,
      branch: featureBranch,
      pullRequestUrl,
      changedFiles,
      executionTime,
      commitHash,
    };

    try {
      await callbackClient.sendResult(id, data.tenantId, {
        ...workerResult,
        logs: logForwarder.getLogs(),
      });
    } catch (callbackError) {
      logger.warn("Failed to send result to platform", {
        jobId: id,
        error:
          callbackError instanceof Error
            ? callbackError.message
            : String(callbackError),
      });
    }

    return workerResult;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await sendProgress("failed", "Job failed", { error: errorMessage });
    logger.error("Task failed", {
      jobId: id,
      error: errorMessage,
      executionTime,
    });

    logForwarder.flush();

    try {
      await callbackClient.sendResult(id, data.tenantId, {
        success: false,
        executionTime,
        errorMessage,
        logs: logForwarder.getLogs(),
        changedFiles: [],
      });
    } catch (callbackError) {
      logger.warn("Failed to send failure result to platform", {
        jobId: id,
        error:
          callbackError instanceof Error
            ? callbackError.message
            : String(callbackError),
      });
    }

    return {
      success: false,
      changedFiles: [],
      executionTime,
      errorMessage,
    };
  }
}
