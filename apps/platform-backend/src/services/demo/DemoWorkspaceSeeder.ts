import { randomBytes } from "crypto";
import type {
  Clanker,
  CreateClankerRequest,
  CreateTicketRequest,
  DeploymentStrategy,
  Ticket,
  TicketWorkflowPhase,
} from "@viberglass/types";
import { hashPassword } from "../../api/auth/utils";
import type { ProjectConfig } from "../../models/PMIntegration";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { DeploymentStrategyDAO } from "../../persistence/clanker/DeploymentStrategyDAO";
import { DemoJobDAO, type FinishedDemoJob } from "../../persistence/demo/DemoJobDAO";
import { DemoSeedRecordDAO, type DemoEntityType } from "../../persistence/demo/DemoSeedRecordDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TicketPhaseDocumentDAO, type ApprovalState } from "../../persistence/ticketing/TicketPhaseDocumentDAO";
import { TicketPhaseRunDAO } from "../../persistence/ticketing/TicketPhaseRunDAO";
import type { UserRole } from "../../persistence/types/user";
import { UserDAO, type PublicUser } from "../../persistence/user/UserDAO";
import { describeJobFailure } from "../job/describeJobFailure";
import { TicketLifecycleStatusService } from "../TicketLifecycleStatusService";
import {
  DEMO_MEMBERS,
  DEMO_REPOSITORY,
  DEMO_RUNNER_NAME,
  DEMO_SPACE_NAME,
  DEMO_TASKS,
  type DemoRun,
  type DemoTask,
} from "./demoWorkspaceContent";

type NewProject = Omit<ProjectConfig, "id" | "createdAt" | "updatedAt" | "slug">;

export interface DemoSeederDependencies {
  records: { record(type: DemoEntityType, id: string): Promise<void> };
  users: {
    createUser(input: { email: string; name: string; passwordHash: string; role?: UserRole }): Promise<PublicUser>;
  };
  projects: { createProject(request: NewProject): Promise<ProjectConfig> };
  strategies: { getDeploymentStrategyByName(name: string): Promise<DeploymentStrategy | null> };
  clankers: {
    createClanker(request: CreateClankerRequest): Promise<Clanker>;
    updateStatus(id: string, status: Clanker["status"], message?: string | null): Promise<Clanker>;
  };
  tickets: {
    createTicket(request: CreateTicketRequest): Promise<Ticket>;
    updateWorkflowPhase(id: string, phase: TicketWorkflowPhase): Promise<void>;
    updatePullRequestUrl(id: string, url: string): Promise<void>;
  };
  documents: {
    create(ticketId: string, phase: TicketWorkflowPhase): Promise<{ id: string }>;
    updateContent(id: string, content: string, storageUrl: string | null): Promise<void>;
    updateApprovalState(
      ticketId: string,
      phase: TicketWorkflowPhase,
      state: ApprovalState,
      approvedBy?: string,
    ): Promise<unknown>;
  };
  runs: { createRun(ticketId: string, jobId: string, clankerId: string, phase: TicketWorkflowPhase): Promise<void> };
  jobs: { insertFinished(job: FinishedDemoJob): Promise<string> };
  lifecycle: { synchronize(ticketId: string): Promise<unknown> };
}

const defaults = (): DemoSeederDependencies => ({
  records: new DemoSeedRecordDAO(),
  users: new UserDAO(),
  projects: new ProjectDAO(),
  strategies: new DeploymentStrategyDAO(),
  clankers: new ClankerDAO(),
  tickets: new TicketDAO(),
  documents: new TicketPhaseDocumentDAO(),
  runs: new TicketPhaseRunDAO(),
  jobs: new DemoJobDAO(),
  lifecycle: new TicketLifecycleStatusService(),
});

/**
 * Writes the demo workspace (demoWorkspaceContent) and records every row it
 * creates as it goes, so even a partly written demo can be removed exactly.
 */
export class DemoWorkspaceSeeder {
  private readonly deps: DemoSeederDependencies;

  constructor(deps: Partial<DemoSeederDependencies> = {}) {
    this.deps = { ...defaults(), ...deps };
  }

  async seed(): Promise<ProjectConfig> {
    const reviewer = await this.createMembers();
    const runner = await this.createRunner();
    const project = await this.deps.projects.createProject({
      name: DEMO_SPACE_NAME,
      ticketSystem: "custom",
      credentials: { type: "token" },
      autoFixEnabled: false,
      autoFixTags: [],
      customFieldMappings: {},
    });
    await this.deps.records.record("project", project.id);

    for (const task of DEMO_TASKS) {
      await this.createTask(project.id, runner.id, reviewer.id, task);
    }
    return project;
  }

  private async createMembers(): Promise<PublicUser> {
    const created: PublicUser[] = [];
    for (const member of DEMO_MEMBERS) {
      // Nobody knows this password: demo members can't sign in.
      const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
      const user = await this.deps.users.createUser({ ...member, passwordHash, role: "member" });
      await this.deps.records.record("user", user.id);
      created.push(user);
    }
    return created[0];
  }

  private async createRunner(): Promise<Clanker> {
    const docker = await this.deps.strategies.getDeploymentStrategyByName("docker");
    const runner = await this.deps.clankers.createClanker({
      name: DEMO_RUNNER_NAME,
      description: "Shows who ran the demo tasks. It never runs anything.",
      deploymentStrategyId: docker?.id ?? null,
      agent: "opencode",
      secretIds: [],
    });
    await this.deps.records.record("clanker", runner.id);
    await this.deps.clankers.updateStatus(runner.id, "inactive", "Sample data for the demo workspace.");
    return runner;
  }

  private async createTask(projectId: string, runnerId: string, reviewerId: string, task: DemoTask): Promise<void> {
    const ticket = await this.deps.tickets.createTicket({
      projectId,
      title: task.title,
      description: task.description,
      severity: "medium",
      category: "General",
      ticketSystem: "custom",
      metadata: { timestamp: new Date().toISOString(), timezone: "UTC" },
      annotations: [],
      autoFixRequested: false,
    });

    for (const run of task.runs) {
      await this.createRun(ticket.id, runnerId, task, run);
    }
    for (const document of task.documents) {
      const created = await this.deps.documents.create(ticket.id, document.phase);
      await this.deps.documents.updateContent(created.id, document.content, null);
      await this.deps.documents.updateApprovalState(ticket.id, document.phase, document.approval, reviewerId);
    }
    if (task.phase !== "research") await this.deps.tickets.updateWorkflowPhase(ticket.id, task.phase);
    if (task.pullRequestUrl) await this.deps.tickets.updatePullRequestUrl(ticket.id, task.pullRequestUrl);
    await this.deps.lifecycle.synchronize(ticket.id);
  }

  private async createRun(ticketId: string, runnerId: string, task: DemoTask, run: DemoRun): Promise<void> {
    const failure = run.outcome === "failed" ? describeJobFailure(run.failureCode, run.errorMessage) : undefined;
    const document = task.documents.find((d) => d.phase === run.phase);
    const jobId = await this.deps.jobs.insertFinished({
      ticketId,
      clankerId: runnerId,
      phase: run.phase,
      repository: DEMO_REPOSITORY,
      task: task.title,
      status: run.outcome,
      result: {
        success: run.outcome === "completed",
        changedFiles: [],
        executionTime: 240_000,
        ...(document ? { documentContent: document.content } : {}),
        ...(run.phase === "execution" && task.pullRequestUrl ? { pullRequestUrl: task.pullRequestUrl } : {}),
        ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
        ...(failure ? { failure } : {}),
      },
      errorMessage: run.errorMessage ?? null,
      finishedAt: new Date(Date.now() - run.hoursAgo * 3_600_000),
    });
    await this.deps.records.record("job", jobId);
    // Phase runs track research and planning; an execution run is linked by the job's ticket alone.
    if (run.phase !== "execution") await this.deps.runs.createRun(ticketId, jobId, runnerId, run.phase);
  }
}
