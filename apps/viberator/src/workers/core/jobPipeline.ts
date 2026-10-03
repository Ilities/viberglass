import * as fs from "fs";
import { Logger } from "winston";
import type { BaseAgentConfig } from "@viberglass/agent-core";
import {
  ATTR_VG_BASE_BRANCH,
  ATTR_VG_REPOSITORY,
  definedAttributes,
  withSpan,
  type CostProvenance,
  type TokenUsage,
} from "@viberglass/telemetry";
import { JOB_FAILURE_CODE, type TaskTurnAction, type WorkerMcpServer, type WorkerSkill } from "@viberglass/types";
import GitService from "../../services/GitService";
import { AgentOrchestrator } from "../../orchestrator/AgentOrchestrator";
import { CodingJobData, JobOverrides, ProjectConfigPayload } from "./types";
import { CallbackClient } from "../infrastructure/CallbackClient";
import { InstructionFileManager } from "../runtime/InstructionFileManager";
import { EnvironmentManager } from "../runtime/EnvironmentManager";
import { LogForwarder } from "../runtime/LogForwarder";
import { mergeWorkerSettings } from "../runtime/workerSettings";
import { failingWith } from "./JobFailureError";
import type { AgentAuthLifecycle } from "./agentAuthLifecycle";
import type { SessionEventForwarder } from "../../acp/SessionEventForwarder";
import { prepareTaskBranch, type TaskBranch } from "./taskBranch";
import { jobWorkspaceDir } from "./taskWorkspace";

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
  /** What the task turn was asked for; absent for jobs that aren't turns. */
  turnAction?: TaskTurnAction;
  /** Whether the turn may change code: its changes become a commit on the task's pull request, else they're thrown away. */
  allowCode: boolean;
  /** The prompt to send instead if the harness can't continue its session. */
  coldStartTask?: string;
  /** On a summarise turn, the instructions to compact the harness's context with afterwards. */
  compactInstructions?: string;
  sessionEventForwarder?: SessionEventForwarder;
  /** S3 URL of conversation state archive to restore before CLI launch */
  conversationStateUrl?: string;
  /** The last commit an agent pushed to the task's branch. */
  lastAgentCommit?: string;
  /** The task's branch as the platform named it, once for the task. */
  taskBranch?: string;
  /** Per-project SCM token resolved from fetchedCredentials */
  scmToken?: string;
  /** The runner's workspace MCP servers; task turns offer them to the agent. */
  mcpServers: WorkerMcpServer[];
  /** The runner's workspace skills, installed before the agent starts. */
  skills: WorkerSkill[];
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
  /** Task turns only: the branch the turn commits to, checked out if it already existed. */
  taskBranch?: TaskBranch;
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

  const jobWorkDir = jobWorkspaceDir(repositoryRoot, data);
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

  // A turn on a task that already has a branch starts from it, so the agent
  // works on top of the earlier builds, and of what people pushed there, and
  // a build's pull request gains commits.
  const taskBranch = params.taskBranch ? await prepareTaskBranch(params, params.taskBranch, repoDir) : undefined;

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

  return { jobWorkDir, repoDir, checkoutBaseBranch, mergedSettings, taskBranch };
}
