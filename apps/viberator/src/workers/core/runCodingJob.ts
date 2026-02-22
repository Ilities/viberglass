import * as fs from "fs";
import * as path from "path";
import { Logger } from "winston";
import { AgentConfig, ExecutionContext } from "../../types";
import { CodexAuthSettings } from "../../config/clankerConfig";
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
import { CodexAuthManager } from "../runtime/CodexAuthManager";
import { LogForwarder } from "../runtime/LogForwarder";
import { buildFeatureBranchName } from "../runtime/branchNaming";
import { mergeWorkerSettings } from "../runtime/workerSettings";

const CODEX_AUTH_FAILURE_PATTERNS: RegExp[] = [
  /unauthorized/i,
  /authentication failed/i,
  /authentication required/i,
  /login required/i,
  /not logged in/i,
  /invalid[_\s-]?token/i,
  /token[^.\n]*(expired|invalid)/i,
  /access token[^.\n]*(expired|invalid)/i,
  /\b401\b/i,
  /invalid_grant/i,
  /run\s+codex\s+login/i,
  /device authorization required/i,
  /session expired/i,
];

export function isCodexStoredAuthFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  const hasAuthSignal =
    normalized.includes("auth") ||
    normalized.includes("login") ||
    normalized.includes("token") ||
    normalized.includes("unauthorized") ||
    normalized.includes("401");

  if (!hasAuthSignal) {
    return false;
  }

  return CODEX_AUTH_FAILURE_PATTERNS.some((pattern) =>
    pattern.test(errorMessage),
  );
}

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
  codexAuthSettings: CodexAuthSettings;
  codexAuthManager: CodexAuthManager;
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

export async function runCodingJob(params: RunCodingJobParams): Promise<JobResult> {
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
    codexAuthSettings,
    codexAuthManager,
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
    scm?.pullRequestRepository?.trim() || scm?.sourceRepository?.trim() || repository;

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

    if (selectedAgent.name === "codex" && codexAuthSettings.mode !== "api_key") {
      await codexAuthManager.ensureDeviceAuth(id, data.tenantId);
    }

    const executeSelectedAgent = () =>
      orchestrator.executeAgent(selectedAgent, executionContext);

    await sendProgress("execute", "Running AI agent", {
      agentName: selectedAgent.name,
    });
    logger.info("Agent selected", { agentName: selectedAgent.name });
    let result = await executeSelectedAgent();

    const shouldRetryWithFreshAuth =
      !result.success &&
      selectedAgent.name === "codex" &&
      codexAuthSettings.mode === "chatgpt_device_stored" &&
      isCodexStoredAuthFailure(result.errorMessage || "");

    if (shouldRetryWithFreshAuth) {
      logger.warn(
        "Codex execution failed with stored auth; retrying after fresh device login",
        {
          jobId: id,
          tenantId: data.tenantId,
          errorMessage: result.errorMessage,
        },
      );

      await sendProgress(
        "auth",
        "Stored Codex auth failed, starting fresh device login",
      );
      await codexAuthManager.forceFreshDeviceAuth(id, data.tenantId);

      await sendProgress("execute", "Retrying AI agent after auth refresh", {
        agentName: selectedAgent.name,
        retry: 1,
      });
      result = await executeSelectedAgent();
    }

    if (!result.success) {
      throw new Error(result.errorMessage || "Agent execution failed");
    }

    await sendProgress("commit", "Committing changes");
    const commitHash = await gitService.commitChanges(repoDir, task);

    await sendProgress("push", "Pushing branch to remote");
    await gitService.pushBranch(repoDir, featureBranch);

    await sendProgress("pr", "Creating pull request");
    const pullRequestUrl = await gitService.createPullRequest(
      repoDir,
      featureBranch,
      pullRequestBaseBranch,
      task,
      result.pullRequestDescription,
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
      changedFiles: result.changedFiles,
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

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
