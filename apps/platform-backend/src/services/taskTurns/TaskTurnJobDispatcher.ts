import { runnerModelEndpoints } from "../modelEndpoints";
import { randomUUID } from "crypto";
import { isObjectRecord, type MediaAsset, type PartRange, type TaskTurnAction, type Ticket } from "@viberglass/types";
import logger from "../../config/logger";
import type { AgentSession } from "../../persistence/agentSession/AgentSessionDAO";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { IntegrationCredentialDAO } from "../../persistence/integrations";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { getClankerProvisioner } from "../../provisioning/provisioningFactory";
import type { BaseJobData, JobData, TicketJobContext } from "../../types/Job";
import { WorkerExecutionService } from "../../workers";
import { CredentialRequirementsService } from "../CredentialRequirementsService";
import { InstructionStorageService } from "../instructions/InstructionStorageService";
import { TaskBranchNamer } from "../tasks/TaskBranchNamer";
import { RunnerToolResolver } from "../runs/RunnerToolResolver";
import { JobService } from "../JobService";
import { JobBootstrapService } from "../job/JobBootstrapService";
import { TicketMediaExecutionService } from "../TicketMediaExecutionService";
import { buildBootstrapPayload, buildScmPayloadFromContext, prepareTicketRunContext } from "../ticketRunOrchestration";
import type { TurnPrompts } from "./TaskTurnPromptBuilder";
import { TURN_JOB_KIND } from "./turnActions";
import { JOB_FAILURE_CODE, type Clanker, type Project } from "@viberglass/types";
import { JobLaunchDAO, type QueuedJobRecord } from "../../persistence/job/JobLaunchDAO";
import type { SpaceFileRun } from "../../persistence/spaceFiles/SpaceFilesDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { spaceFilesRuns, type SpaceFilesRunService } from "../spaceFiles/SpaceFilesRunService";
import { claimSpaceFiles, withoutRepository } from "../spaceFiles/filesRunBootstrap";

export interface DispatchTurnInput {
  session: AgentSession;
  turnId: string;
  action: TaskTurnAction;
  allowCode: boolean;
  /** For a build: the parts it covers in a new pull request; null when it continues the open one. */
  buildParts?: PartRange | null;
  prompts: TurnPrompts;
  ticket: Ticket;
  documents: { plan: string };
  /** The latest summary of the conversation, written into the repository as SUMMARY.md. */
  summary: string;
  /** The last commit an agent pushed to the task's branch, so the worker can tell it what people pushed since. */
  lastAgentCommit: string | null;
  /** Images attached to the thread messages this turn answers. */
  messageImages?: MediaAsset[];
}

/** What a harness with a compact command keeps when it compacts after a summary. */
const COMPACT_INSTRUCTIONS =
  "Keep the decisions made on this task, who agreed to each, and the open questions. SUMMARY.md has the summary you just wrote.";

/** The harness's own session id and saved state, from earlier turns. */
function resumeState(metadata: unknown): { acpSessionId: string | null; conversationStateUrl: string | null } {
  if (!isObjectRecord(metadata)) return { acpSessionId: null, conversationStateUrl: null };
  return {
    acpSessionId: typeof metadata.acpSessionId === "string" ? metadata.acpSessionId : null,
    conversationStateUrl: typeof metadata.conversationStateUrl === "string" ? metadata.conversationStateUrl : null,
  };
}

function jobDataFor(action: TaskTurnAction, base: Omit<BaseJobData, "jobKind">, context: TicketJobContext): JobData {
  const kind = TURN_JOB_KIND[action];
  switch (kind) {
    case "planning":
      return { ...base, jobKind: kind, context };
    case "execution":
      return { ...base, jobKind: kind, context };
    default:
      return { ...base, jobKind: "reply", context };
  }
}

/** Submits a turn's job and starts its worker. The worker clones the repository and runs one ACP turn. */
export class TaskTurnJobDispatcher {
  private readonly runContextDeps = {
    projectDAO: new ProjectDAO(),
    projectScmConfigDAO: new ProjectScmConfigDAO(),
    integrationCredentialDAO: new IntegrationCredentialDAO(),
    clankerDAO: new ClankerDAO(),
    provisioningService: getClankerProvisioner(),
    instructionStorageService: new InstructionStorageService(),
    runnerTools: new RunnerToolResolver(undefined, undefined, runnerModelEndpoints),
  };

  constructor(
    private readonly jobService: Pick<JobService, "submitJob"> = new JobService(),
    private readonly bootstraps: Pick<JobBootstrapService, "saveBootstrapPayload"> = new JobBootstrapService(),
    private readonly credentials: Pick<CredentialRequirementsService, "getRequiredCredentialsForClanker"> = new CredentialRequirementsService(),
    private readonly workers: Pick<WorkerExecutionService, "executeJob"> = new WorkerExecutionService(),
    private readonly media: Pick<TicketMediaExecutionService, "prepareForExecution"> = new TicketMediaExecutionService(),
    private readonly branches: Pick<TaskBranchNamer, "nameFor" | "existing"> = new TaskBranchNamer(),
    private readonly spaceFiles: Pick<SpaceFilesRunService, "enqueue" | "payloadFor"> = spaceFilesRuns,
    private readonly launches: Pick<JobLaunchDAO, "getQueued"> = new JobLaunchDAO(),
    private readonly tickets: Pick<TicketDAO, "getTicket"> = new TicketDAO(),
    private readonly failures: Pick<JobService, "updateJobStatus"> = new JobService(),
  ) {}

  /**
   * `onSubmitted` runs once the job exists and before its worker starts, so
   * the turn knows its job by the time the worker reports on it.
   */
  async dispatch(
    input: DispatchTurnInput,
    onSubmitted: (job: { id: string; prompt: string }) => Promise<void>,
  ): Promise<{ id: string; status: string }> {
    const { session, ticket, action, prompts } = input;
    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const prepared = await prepareTicketRunContext(
      { projectId: session.projectId, clankerId: session.clankerId, jobId },
      this.runContextDeps,
    );
    const files = prepared.project.backingKind === "files";
    const ticketMedia = await this.media.prepareForExecution(ticket, prepared.executionClanker, input.messageImages ?? []);
    const { acpSessionId, conversationStateUrl } = resumeState(session.metadataJson);
    // A first turn starts cold for certain; a later one only if the harness can't resume.
    const task = acpSessionId ? prompts.prompt : prompts.coldStartPrompt;

    const jobData = jobDataFor(
      // A Files artifact run opens no pull request, so it isn't an execution run that puts the task in review.
      files && action === "code" ? "reply" : action,
      {
        id: jobId,
        tenantId: "api-server",
        repository: prepared.sourceRepository,
        task,
        ...(files ? {} : { baseBranch: prepared.baseBranch }),
        settings: { testRequired: false, maxChanges: action === "code" ? 10 : 1 },
        scm: files ? null : buildScmPayloadFromContext(prepared),
        ...(ticketMedia.mounts.length > 0 ? { mounts: ticketMedia.mounts } : {}),
        timestamp: Date.now(),
      },
      {
        ticketId: ticket.id,
        originalTicketId: ticket.externalTicketId || ticket.id,
        ticketTitle: ticket.title,
        ticketDescription: ticket.description,
        planDocument: input.documents.plan || undefined,
        summaryDocument: input.summary || undefined,
        instructionFiles: prepared.mergedInstructionFiles,
        ...(ticketMedia.media.length > 0 ? { ticketMedia: ticketMedia.media } : {}),
      },
    );

    const submitted = await this.jobService.submitJob(jobData, { ticketId: ticket.id, clankerId: session.clankerId, turnAction: action });
    jobData.callbackToken = submitted.callbackToken;
    const bootstrap: Record<string, unknown> = {
      ...buildBootstrapPayload({
        workerType: prepared.workerType,
        jobKind: jobData.jobKind,
        tenantId: jobData.tenantId,
        jobId,
        clankerId: session.clankerId,
        agent: prepared.executionClanker.agent,
        repository: jobData.repository,
        task,
        baseBranch: jobData.baseBranch,
        context: jobData.context,
        settings: jobData.settings,
        instructionFiles: prepared.workerInstructionFiles,
        requiredCredentials: await this.credentials.getRequiredCredentialsForClanker(prepared.executionClanker),
        callbackToken: submitted.callbackToken,
        executionClanker: prepared.executionClanker,
        project: prepared.project,
        scm: jobData.scm,
        mcpServers: prepared.mcpServers,
        skills: prepared.skills,
      }),
      agentSessionId: session.id,
      agentTurnId: input.turnId,
      turnAction: action,
      allowCode: input.allowCode,
      acpSessionId,
      conversationStateUrl,
      ...(files
        ? {}
        : {
            lastAgentCommit: input.lastAgentCommit,
            // A build names its pull request's branch; other turns read the code on the latest one, if there's one.
            taskBranch:
              action === "code"
                ? await this.branches.nameFor(ticket.id, jobId, input.buildParts ?? null)
                : ((await this.branches.existing(ticket.id)) ?? undefined),
          }),
      ...(acpSessionId ? { coldStartTask: prompts.coldStartPrompt } : {}),
      ...(action === "summarise" ? { compactInstructions: COMPACT_INSTRUCTIONS } : {}),
    };
    // A Files run works on the space's files, not a repository.
    if (files) withoutRepository(bootstrap);
    jobData.bootstrapPayload = bootstrap;
    await this.bootstraps.saveBootstrapPayload(jobId, bootstrap);
    await onSubmitted({ id: jobId, prompt: task });

    // One run at a time changes a space's files; this one may wait for another to save.
    if (files && !(await claimSpaceFiles(this.spaceFiles, this.bootstraps, { jobId, projectId: prepared.project.id, bootstrap }))) {
      return { id: jobId, status: "queued" };
    }
    this.invoke(jobData, prepared.executionClanker, prepared.project, session.id);
    return { id: jobId, status: "pending" };
  }

  /**
   * Starts the worker of a Files run that waited for its space, from what was
   * saved when it was submitted. Scheduled runs wait here too; they have no task.
   */
  async launchWaiting(run: SpaceFileRun): Promise<void> {
    const job = await this.launches.getQueued(run.jobId);
    if (!job?.clankerId) throw new Error(`Job ${run.jobId} can no longer start`);
    try {
      await this.startWaiting(run, job as QueuedJobRecord & { clankerId: string });
    } catch (error) {
      // A run that can't start fails, so its turn ends and the space moves on.
      await this.failures.updateJobStatus(job.id, "failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
        failureCode: JOB_FAILURE_CODE.RUNNER_UNAVAILABLE,
      });
      throw error;
    }
  }

  private async startWaiting(run: SpaceFileRun, job: QueuedJobRecord & { clankerId: string }): Promise<void> {
    const prepared = await prepareTicketRunContext(
      { projectId: run.projectId, clankerId: job.clankerId, jobId: job.id },
      this.runContextDeps,
    );
    const ticket = job.ticketId ? await this.tickets.getTicket(job.ticketId) : null;
    if (job.ticketId && !ticket) throw new Error(`Job ${run.jobId} has no task to run`);
    const ticketMedia = ticket ? await this.media.prepareForExecution(ticket, prepared.executionClanker) : { mounts: [] };
    const bootstrap: Record<string, unknown> = { ...job.bootstrapPayload, files: this.spaceFiles.payloadFor(run) };
    await this.bootstraps.saveBootstrapPayload(job.id, bootstrap);
    const jobData = {
      id: job.id,
      jobKind: job.jobKind,
      tenantId: job.tenantId,
      repository: "",
      task: job.task,
      settings: job.settings,
      context: job.context,
      scm: null,
      ...(ticketMedia.mounts.length > 0 ? { mounts: ticketMedia.mounts } : {}),
      timestamp: Date.now(),
      callbackToken: job.callbackToken,
      bootstrapPayload: bootstrap,
    } as unknown as JobData;
    this.invoke(jobData, prepared.executionClanker, prepared.project, String(bootstrap.agentSessionId ?? ""));
  }

  private invoke(jobData: JobData, clanker: Clanker, project: Project, sessionId: string): void {
    const jobId = jobData.id;
    this.workers
      .executeJob(jobData, clanker, project)
      .then((result) => logger.info("Task turn worker invoked", { sessionId, jobId, executionId: result.executionId }))
      .catch((error: unknown) =>
        logger.error("Task turn worker invocation failed", {
          sessionId,
          jobId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  }
}
