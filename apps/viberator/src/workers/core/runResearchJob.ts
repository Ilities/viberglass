import * as fs from "fs";
import * as path from "path";
import { Logger } from "winston";
import { AgentConfig, ExecutionContext } from "../../types";
import GitService from "../../services/GitService";
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
import type { AgentAuthContext, AgentAuthLifecycle } from "./agentAuthLifecycle";
import { AgentOrchestrator } from "../../orchestrator/AgentOrchestrator";

interface RunResearchJobParams {
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

const RESEARCH_DOCUMENT_NAME = "RESEARCH.md";

export async function runResearchJob(
  params: RunResearchJobParams,
): Promise<JobResult> {
  const {
    data,
    repositoryRoot,
    logger,
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
  const { id, repository, task, baseBranch, settings } = data;
  const checkoutBaseBranch = baseBranch || "main";

  logForwarder.setupForJob(id, data.tenantId);
  logger.info("Processing research task", { jobId: id, repository });
  await sendProgress("initialize", "Starting research execution");
  environmentManager.inject(fetchedCredentials, clankerEnvironment);

  try {
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
      jobSettings: settings,
      clankerConfig,
      projectConfig,
      overrides,
    });

    const executionContext: ExecutionContext = {
      repoUrl: repository,
      branch: checkoutBaseBranch,
      baseBranch: checkoutBaseBranch,
      repoDir,
      commitHash: "",
      bugDescription: task,
      stepsToReproduce: "",
      expectedBehavior: "",
      actualBehavior: "",
      maxChanges: mergedSettings.maxChanges ?? 1,
      testRequired: false,
      runTests: false,
      maxExecutionTime: mergedSettings.maxExecutionTime,
      promptOverride: task,
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
    let result = await executeSelectedAgent();
    if (agentAuthLifecycle.shouldRetryAfterFailure(authContext, result)) {
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

    await sendProgress("document", "Reading generated research document");
    const documentPath = path.join(repoDir, RESEARCH_DOCUMENT_NAME);
    if (!fs.existsSync(documentPath)) {
      throw new Error(`${RESEARCH_DOCUMENT_NAME} was not generated`);
    }

    const documentContent = fs.readFileSync(documentPath, "utf-8");
    await sendProgress("cleanup", "Cleaning up workspace");
    cleanupWorkspace(jobWorkDir);

    const executionTime = Date.now() - startTime;
    await sendProgress("complete", "Research completed successfully");
    logForwarder.flush();

    const workerResult: JobResult = {
      success: true,
      documentContent,
      changedFiles: result.changedFiles,
      executionTime,
    };

    try {
      await callbackClient.sendResult(id, data.tenantId, {
        ...workerResult,
        logs: logForwarder.getLogs(),
      });
    } catch (callbackError) {
      logger.warn("Failed to send research result to platform", {
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
    await sendProgress("failed", "Research job failed", { error: errorMessage });
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
      logger.warn("Failed to send research failure result to platform", {
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
