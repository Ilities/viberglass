import * as fs from "fs";
import * as path from "path";
import { Logger } from "winston";
import type { BaseAgentConfig } from "@viberglass/agent-core";
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_VG_AGENT_AUTH_RETRIED,
  ATTR_VG_AGENT_SESSION_ID,
  ATTR_VG_AGENT_TURN_ID,
  ATTR_VG_BASE_BRANCH,
  ATTR_VG_CHANGED_FILE_COUNT,
  ATTR_VG_JOB_ID,
  ATTR_VG_JOB_KIND,
  ATTR_VG_REPOSITORY,
  ATTR_VG_SESSION_MODE,
  ATTR_VG_STOP_REASON,
  ATTR_VG_TENANT_ID,
  definedAttributes,
  markSpanFailed,
  providerNameForAgent,
  RUN_MANIFEST_VERSION,
  SpanKind,
  withSpan,
  type CostProvenance,
  type ExecutionManifest,
  type TokenUsage,
} from "@viberglass/telemetry";
import { JOB_FAILURE_CODE } from "@viberglass/types";
import { ExecutionContext } from "../../types";
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
import { classifyAgentFailure } from "./classifyAgentFailure";
import { failingWith, JobFailureError } from "./JobFailureError";
import type {
  AgentAuthContext,
  AgentAuthLifecycle,
} from "./agentAuthLifecycle";
import type { SessionEventForwarder } from "../../acp/SessionEventForwarder";

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
  agentSessionId?: string;
  agentTurnId?: string;
  acpSessionId?: string;
  sessionMode?: "research" | "planning" | "execution";
  sessionEventForwarder?: SessionEventForwarder;
  /** S3 URL of conversation state archive to restore before CLI launch */
  conversationStateUrl?: string;
  /** Per-project SCM token resolved from fetchedCredentials */
  scmToken?: string;
  selectAgentForExecution: (availableAgents: BaseAgentConfig[]) => BaseAgentConfig;
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
  /**
   * Mutable scratch space for the run manifest.
   *
   * The facts the manifest needs are discovered at different depths —
   * base SHA during setup, agent and token usage during execution, commit
   * and PR at the end — and `withJobLifecycle`, which assembles the final
   * manifest, sits above all of them. Rather than changing every return type
   * along the way, each stage records what it learns here.
   *
   * Assigned by `withJobLifecycle` before the runner executes.
   */
  manifest?: ManifestScratch;
}

/** Facts collected during a run, assembled into an ExecutionManifest at the end. */
export interface ManifestScratch {
  agent?: string;
  harnessVersion?: string;
  modelSnapshot?: string;
  baseSha?: string;
  promptHash?: string;
  promptCharacters?: number;
  usage?: TokenUsage;
  usageAvailable: boolean;
  costUsd?: number;
  costProvenance: CostProvenance;
  stopReason?: string;
  startedAt: string;
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
  // Cloning is a common and slow failure point (auth, large repos, network
  // policy), and it is worth being able to separate it from agent time when
  // reading job latency.
  const repoDir = await withSpan(
    "git.clone",
    {
      attributes: definedAttributes({
        [ATTR_VG_REPOSITORY]: repository,
        [ATTR_VG_BASE_BRANCH]: checkoutBaseBranch,
      }),
    },
    async () =>
      failingWith(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED, () =>
        cloneRepositoryToWorkspace(repository, checkoutBaseBranch, jobWorkDir),
      ),
  );

  // The exact commit the run starts from, captured before instruction files
  // are written and before the agent touches anything. "base branch was main"
  // is not reproducible; a SHA is.
  const baseSha = await params.gitService.getHeadSha(repoDir);
  if (params.manifest) {
    params.manifest.baseSha = baseSha;
  }

  if (instructionFiles.size > 0) {
    await sendProgress("instructions", "Applying instruction files", {
      count: instructionFiles.size,
    });
    await withSpan(
      "instructions.materialize",
      { attributes: { "vg.instructions.count": instructionFiles.size } },
      async () => instructionFileManager.materialize(repoDir, instructionFiles),
    );
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
  acpTurnOutcome?: "completed" | "needs_input" | "needs_approval";
  newAcpSessionId?: string;
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
  await failingWith(JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID, () =>
    agentAuthLifecycle.ensureReady(authContext),
  );

  const executeSelectedAgent = () =>
    orchestrator.executeAgent(selectedAgent, executionContext);

  await sendProgress("execute", "Running AI agent", {
    agentName: selectedAgent.name,
  });
  logger.info("Agent selected", { agentName: selectedAgent.name });

  // Orchestration span: agent selection, auth readiness and the auth retry.
  // Deliberately *not* tagged with `gen_ai.operation.name` — the GenAI
  // `invoke_agent` span is the one BaseAgent opens around the CLI itself,
  // which is where the model and token usage are actually known. Tagging both
  // would double-count every agent invocation in per-operation aggregates.
  return withSpan(
    `agent.execute ${selectedAgent.name}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: definedAttributes({
        [ATTR_GEN_AI_AGENT_NAME]: selectedAgent.name,
        [ATTR_GEN_AI_PROVIDER_NAME]: providerNameForAgent(selectedAgent.name),
        [ATTR_VG_JOB_ID]: data.id,
        [ATTR_VG_TENANT_ID]: data.tenantId,
        [ATTR_VG_AGENT_SESSION_ID]: params.agentSessionId,
        [ATTR_VG_AGENT_TURN_ID]: params.agentTurnId,
        [ATTR_VG_SESSION_MODE]: params.sessionMode,
      }),
    },
    async (span) => {
      let result = await executeSelectedAgent();
      let authRetried = false;

      if (agentAuthLifecycle.shouldRetryAfterFailure(authContext, result)) {
        authRetried = true;
        logger.warn(
          "Agent execution failed due to auth; retrying after auth refresh",
          {
            jobId: data.id,
            agentName: selectedAgent.name,
            errorMessage: result.errorMessage,
          },
        );
        // Recorded as an event rather than a second span: the retry is the
        // same logical agent invocation, and splitting it would double-count
        // agent runs in any per-attempt aggregate.
        span.addEvent("agent.auth_refresh", {
          "vg.agent.first_attempt_error": result.errorMessage ?? "",
        });
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

      const stopReason =
        result.acpTurnOutcome ?? (result.success ? "completed" : "failed");

      span.setAttributes(
        definedAttributes({
          [ATTR_VG_AGENT_AUTH_RETRIED]: authRetried,
          [ATTR_VG_CHANGED_FILE_COUNT]: result.changedFiles?.length,
          [ATTR_VG_STOP_REASON]: stopReason,
        }),
      );

      recordAgentResultInManifest(params.manifest, selectedAgent.name, result, stopReason);

      if (!result.success) {
        // Thrown so the job fails as before; marked first so the reason is on
        // the span even though withSpan would also record the exception.
        markSpanFailed(span, result.errorMessage || "Agent execution failed");
        throw new JobFailureError(
          classifyAgentFailure(result.errorMessage),
          result.errorMessage || "Agent execution failed",
        );
      }

      return result;
    },
  );
}

/**
 * Copies what the agent reported into the manifest scratch.
 *
 * Cost provenance is the point of the branching below. A CLI-reported cost is
 * `actual`; the plugin's `costPerExecution` constant is `estimated`; a plugin
 * with neither records `unavailable`. Collapsing these would make a hardcoded
 * constant indistinguishable from a measurement in the eval corpus.
 */
function recordAgentResultInManifest(
  manifest: ManifestScratch | undefined,
  agentName: string,
  result: ExecutionResultLike,
  stopReason: string,
): void {
  if (!manifest) return;

  manifest.agent = agentName;
  manifest.stopReason = stopReason;
  manifest.promptHash = result.promptHash;
  manifest.promptCharacters = result.promptCharacters;

  const usage = result.usage;
  manifest.usageAvailable = Boolean(usage);

  if (usage) {
    manifest.modelSnapshot = usage.model;
    manifest.harnessVersion = usage.harnessVersion;
    manifest.usage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      reasoningOutputTokens: usage.reasoningOutputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
    };
  }

  if (usage?.costUsd !== undefined) {
    manifest.costUsd = usage.costUsd;
    manifest.costProvenance = "actual";
  } else if (typeof result.cost === "number" && Number.isFinite(result.cost)) {
    manifest.costUsd = result.cost;
    manifest.costProvenance = "estimated";
  } else {
    manifest.costProvenance = "unavailable";
  }
}

/** The subset of the agent's ExecutionResult the manifest reads. */
interface ExecutionResultLike {
  cost?: number;
  promptHash?: string;
  promptCharacters?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningOutputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    costUsd?: number;
    model?: string;
    harnessVersion?: string;
  };
}

/**
 * Wraps a job runner function with shared error handling and result callbacks.
 */
export async function withJobLifecycle(
  params: JobRunnerParams,
  jobLabel: string,
  execute: () => Promise<JobResult>,
): Promise<JobResult> {
  // CONSUMER: the receiving end of the backend's `worker.invoke` PRODUCER
  // span. This is the worker's root span, and it is the parent of every
  // clone / agent / commit / PR span for the job.
  return withSpan(
    "job.execute",
    {
      kind: SpanKind.CONSUMER,
      attributes: definedAttributes({
        [ATTR_VG_JOB_ID]: params.data.id,
        [ATTR_VG_JOB_KIND]: params.data.jobKind,
        [ATTR_VG_TENANT_ID]: params.data.tenantId,
        [ATTR_VG_REPOSITORY]: params.data.repository,
        [ATTR_VG_AGENT_SESSION_ID]: params.agentSessionId,
        [ATTR_VG_AGENT_TURN_ID]: params.agentTurnId,
        [ATTR_VG_SESSION_MODE]: params.sessionMode,
      }),
    },
    async (span) => {
      // Created here, before the runner starts, so every stage below can
      // record what it learns. `usageAvailable: false` / `unavailable` are
      // the correct defaults: a job that dies before the agent runs reported
      // no usage, and saying so is the point.
      params.manifest = {
        usageAvailable: false,
        costProvenance: "unavailable",
        startedAt: new Date().toISOString(),
      };

      const result = await runJobLifecycle(params, jobLabel, execute);

      span.setAttributes(
        definedAttributes({
          [ATTR_VG_CHANGED_FILE_COUNT]: result.changedFiles.length,
          [ATTR_VG_STOP_REASON]: result.success ? "completed" : "failed",
        }),
      );

      // runJobLifecycle catches everything and reports failure as data — it
      // must, because the platform needs the result callback either way — so
      // the span has to be failed explicitly or every job would look green.
      if (!result.success) {
        markSpanFailed(span, result.errorMessage ?? `${jobLabel} failed`);
      }

      return result;
    },
  );
}

async function runJobLifecycle(
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

    const workerResult: JobResult = {
      ...result,
      executionTime,
      runManifest: buildExecutionManifest(params.manifest, {
        success: result.success,
        executionTime,
        branch: result.branch,
        commitSha: result.commitHash,
        pullRequestUrl: result.pullRequestUrl,
        changedFileCount: result.changedFiles.length,
      }),
    };

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
    const failureCode =
      error instanceof JobFailureError ? error.code : JOB_FAILURE_CODE.RUN_FAILED;

    await sendProgress("failed", `${jobLabel} failed`, {
      error: errorMessage,
    });
    logger.error(`${jobLabel} failed`, {
      jobId: data.id,
      error: errorMessage,
      failureCode,
      executionTime,
    });
    logForwarder.flush();

    // A failed run is still a run, and a failure is exactly the case the eval
    // corpus needs recorded — so the manifest goes out on this path too.
    const failureManifest = buildExecutionManifest(params.manifest, {
      success: false,
      executionTime,
      errorMessage,
      changedFileCount: 0,
    });

    try {
      await callbackClient.sendResult(data.id, data.tenantId, {
        success: false,
        executionTime,
        errorMessage,
        failureCode,
        logs: [],
        changedFiles: [],
        runManifest: failureManifest,
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
      runManifest: failureManifest,
    };
  }
}

interface ManifestOutcome {
  success: boolean;
  executionTime: number;
  errorMessage?: string;
  branch?: string;
  commitSha?: string;
  pullRequestUrl?: string;
  changedFileCount?: number;
}

/** Merges the scratch collected during the run with its final outcome. */
function buildExecutionManifest(
  scratch: ManifestScratch | undefined,
  outcome: ManifestOutcome,
): ExecutionManifest {
  const finishedAt = new Date().toISOString();

  return {
    manifestVersion: RUN_MANIFEST_VERSION,
    agent: scratch?.agent,
    harnessVersion: scratch?.harnessVersion,
    modelSnapshot: scratch?.modelSnapshot,
    baseSha: scratch?.baseSha,
    commitSha: outcome.commitSha,
    branch: outcome.branch,
    pullRequestUrl: outcome.pullRequestUrl,
    changedFileCount: outcome.changedFileCount,
    promptHash: scratch?.promptHash,
    promptCharacters: scratch?.promptCharacters,
    usage: scratch?.usage,
    usageAvailable: scratch?.usageAvailable ?? false,
    costUsd: scratch?.costUsd,
    costProvenance: scratch?.costProvenance ?? "unavailable",
    // The agent's own stop reason when it got that far, otherwise the job
    // outcome — a job can fail during clone or PR creation, never reaching
    // the agent at all.
    stopReason:
      scratch?.stopReason ?? (outcome.success ? "completed" : "failed"),
    success: outcome.success,
    errorMessage: outcome.errorMessage,
    startedAt: scratch?.startedAt,
    finishedAt,
    durationMs: outcome.executionTime,
  };
}
