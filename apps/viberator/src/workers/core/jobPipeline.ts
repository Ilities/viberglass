import { waitForModelEndpoint } from "./modelEndpointReadiness";
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
import { JOB_FAILURE_CODE, type FilesWorkspacePayload, type TaskTurnAction, type WorkerMcpServer, type WorkerSkill } from "@viberglass/types";
import GitService from "../../services/GitService";
import { AgentOrchestrator } from "../../orchestrator/AgentOrchestrator";
import { CodingJobData, JobOverrides, ProjectConfigPayload, type ForkBase } from "./types";
import { CallbackClient } from "../infrastructure/CallbackClient";
import type { GitAuth } from "../../services/gitAuth";
import { InstructionFileManager, type MaterializedFile } from "../runtime/InstructionFileManager";
import { prepareFilesWorkspace, type FilesRun } from "../files/filesWorkspace";
import { EnvironmentManager } from "../runtime/EnvironmentManager";
import { LogForwarder } from "../runtime/LogForwarder";
import type { WorkerObjectStorage } from "../infrastructure/workerObjectStorage";
import { mergeWorkerSettings } from "../runtime/workerSettings";
import { failingWith } from "./JobFailureError";
import type { AgentAuthLifecycle } from "./agentAuthLifecycle";
import type { SessionEventForwarder } from "../../acp/SessionEventForwarder";
import { prepareTaskBranch, type TaskBranch } from "./taskBranch";
import { jobWorkspaceDir } from "./taskWorkspace";

export interface JobRunnerParams {
  objectStorage?: WorkerObjectStorage;
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
  /** Where a forked task's run starts when its branch isn't on origin yet. */
  forkBase?: ForkBase;
  /** What git authenticates to the repository with: the space's token, and the username its code host takes. */
  gitAuth?: GitAuth;
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
  /** Instruction files written into the working directory, to put back before a Files run saves it. */
  materializedFiles: MaterializedFile[];
}

/**
 * Shared setup: initialize logging/env, create workspace, clone the repo
 * or restore the space's files, apply instruction files, and merge settings.
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

  const workspace = data.files
    ? { repoDir: await prepareFilesWorkspace(filesRunOf(params, data.files), jobWorkDir), taskBranch: undefined }
    : await prepareGitWorkspace(params, requireRepository(repository), checkoutBaseBranch, jobWorkDir);
  const { repoDir, taskBranch } = workspace;

  let materializedFiles: MaterializedFile[] = [];
  if (instructionFiles.size > 0) {
    await sendProgress("instructions", "Applying instruction files", {
      count: instructionFiles.size,
    });
    materializedFiles = await withSpan(
      "instructions.materialize",
      { attributes: { "vg.instructions.count": instructionFiles.size } },
      async () => instructionFileManager.materialize(repoDir, instructionFiles),
    );
  }

  await waitForModelEndpoint(clankerConfig, sendProgress);

  const mergedSettings = mergeWorkerSettings({
    defaults: { maxExecutionTime: defaultTimeout },
    jobSettings: data.settings,
    clankerConfig,
    projectConfig,
    overrides,
  });

  return { jobWorkDir, repoDir, checkoutBaseBranch, mergedSettings, taskBranch, materializedFiles };
}

/** Clones the repository and checks out the task's branch, recording the commit the run starts from. */
async function prepareGitWorkspace(
  params: JobRunnerParams,
  repository: string,
  checkoutBaseBranch: string,
  jobWorkDir: string,
): Promise<{ repoDir: string; taskBranch?: TaskBranch }> {
  await params.sendProgress("clone", "Cloning repository", { repository });
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
        params.cloneRepositoryToWorkspace(repository, checkoutBaseBranch, jobWorkDir),
      ),
  );

  // A turn on a task that already has a branch starts from it, so the agent
  // works on top of the earlier builds, and of what people pushed there, and
  // a build's pull request gains commits.
  const taskBranch = params.taskBranch ? await prepareTaskBranch(params, params.taskBranch, repoDir) : undefined;
  if (params.forkBase && !taskBranch?.continued) {
    const forkBase = params.forkBase;
    await failingWith(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED, () => params.gitService.checkoutForkBase(repoDir, forkBase, params.gitAuth));
  }

  // The exact commit the run starts from, captured before instruction files
  // are written and before the agent touches anything. "base branch was main"
  // is not reproducible; a SHA is.
  const baseSha = await params.gitService.getHeadSha(repoDir);
  if (params.manifest) {
    params.manifest.baseSha = baseSha;
  }

  return { repoDir, taskBranch };
}

function requireRepository(repository: string | undefined): string {
  if (!repository) throw new Error("The run has neither a repository nor a Files space to work in");
  return repository;
}

/** What restoring and saving a Files run's space files needs from the run. */
export function filesRunOf(params: JobRunnerParams, files: FilesWorkspacePayload): FilesRun {
  return {
    jobId: params.data.id,
    tenantId: params.data.tenantId,
    files,
    client: params.callbackClient.files,
    logger: params.logger,
    sendProgress: params.sendProgress,
  };
}
