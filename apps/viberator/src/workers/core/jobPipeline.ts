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
import { mergeWorkerSettings } from "../runtime/workerSettings";
import type {
  AgentAuthContext,
  AgentAuthLifecycle,
} from "./agentAuthLifecycle";

export interface JobRunnerParams {
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
}

export interface MergedSettings {
  maxChanges: number;
  testRequired: boolean;
  codingStandards?: string;
  runTests: boolean;
  testCommand?: string;
  maxExecutionTime: number;
}

export interface JobSetupResult {
  jobWorkDir: string;
  repoDir: string;
  checkoutBaseBranch: string;
  mergedSettings: MergedSettings;
}

/**
 * Shared setup: initialize logging/env, create workspace, clone repo,
 * apply instruction files, and merge settings.
 */
export async function setupJob(
  params: JobRunnerParams,
  jobLabel: string,
): Promise<JobSetupResult> {
  const {
    data,
    repositoryRoot,
    logger,
    instructionFileManager,
    instructionFiles,
    fetchedCredentials,
    clankerEnvironment,
    clankerConfig,
    projectConfig,
    overrides,
    environmentManager,
    logForwarder,
    defaultTimeout,
    sendProgress,
    cloneRepositoryToWorkspace,
  } = params;

  const { id, repository, baseBranch } = data;
  const checkoutBaseBranch =
    data.scm?.baseBranch?.trim() || baseBranch || "main";

  logForwarder.setupForJob(id, data.tenantId);
  logger.info(`Processing ${jobLabel} task`, { jobId: id, repository });
  await sendProgress("initialize", `Starting ${jobLabel} execution`);
  environmentManager.inject(fetchedCredentials, clankerEnvironment);

  const jobWorkDir = path.join(repositoryRoot, id);
  if (!fs.existsSync(jobWorkDir)) {
    fs.mkdirSync(jobWorkDir, { recursive: true });
  }

  await sendProgress("clone", "Cloning repository", { repository });
  const repoDir = await cloneRepositoryToWorkspace(
    repository,
    checkoutBaseBranch,
    jobWorkDir,
  );

  if (instructionFiles.size > 0) {
    await sendProgress("instructions", "Applying instruction files", {
      count: instructionFiles.size,
    });
    await instructionFileManager.materialize(repoDir, instructionFiles);
  }

  const mergedSettings = mergeWorkerSettings({
    defaults: { maxExecutionTime: defaultTimeout },
    jobSettings: data.settings,
    clankerConfig,
    projectConfig,
    overrides,
  });

  return { jobWorkDir, repoDir, checkoutBaseBranch, mergedSettings };
}

export interface AgentExecutionResult {
  success: boolean;
  changedFiles: string[];
  errorMessage?: string;
}

/**
 * Select an agent, ensure auth, execute with auth-retry logic.
 */
export async function executeAgentWithRetry(
  params: JobRunnerParams,
  executionContext: ExecutionContext,
): Promise<AgentExecutionResult> {
  const {
    data,
    orchestrator,
    agentAuthLifecycle,
    selectAgentForExecution,
    sendProgress,
    logger,
  } = params;

  const availableAgents = orchestrator.getAvailableAgents();
  const selectedAgent = selectAgentForExecution(availableAgents);
  executionContext.agent = selectedAgent.name;

  const authContext: AgentAuthContext = {
    agentName: selectedAgent.name,
    jobId: data.id,
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

  if (agentAuthLifecycle.shouldRetryAfterFailure(authContext, result)) {
    logger.warn(
      "Agent execution failed due to auth; retrying after auth refresh",
      {
        jobId: data.id,
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

  return result;
}

/**
 * Wraps a job runner function with shared error handling and result callbacks.
 */
export async function withJobLifecycle(
  params: JobRunnerParams,
  jobLabel: string,
  execute: () => Promise<JobResult>,
): Promise<JobResult> {
  const { data, callbackClient, logForwarder, sendProgress, logger } = params;
  const startTime = Date.now();

  try {
    const result = await execute();
    const executionTime = Date.now() - startTime;

    await sendProgress("complete", `${jobLabel} completed successfully`);
    logForwarder.flush();

    const workerResult: JobResult = { ...result, executionTime };

    try {
      await callbackClient.sendResult(data.id, data.tenantId, {
        ...workerResult,
        logs: [],
      });
    } catch (callbackError) {
      logger.warn(`Failed to send ${jobLabel} result to platform`, {
        jobId: data.id,
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

    await sendProgress("failed", `${jobLabel} failed`, {
      error: errorMessage,
    });
    logger.error(`${jobLabel} failed`, {
      jobId: data.id,
      error: errorMessage,
      executionTime,
    });
    logForwarder.flush();

    try {
      await callbackClient.sendResult(data.id, data.tenantId, {
        success: false,
        executionTime,
        errorMessage,
        logs: [],
        changedFiles: [],
      });
    } catch (callbackError) {
      logger.warn(`Failed to send ${jobLabel} failure result to platform`, {
        jobId: data.id,
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
