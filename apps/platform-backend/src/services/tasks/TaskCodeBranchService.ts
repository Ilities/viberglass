import { buildFeatureBranchName, type TaskCodeBranch } from "@viberglass/types";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { TaskTakeoverDAO } from "../../persistence/ticketing/TaskTakeoverDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket">;
  scm: Pick<ProjectScmConfigDAO, "getByProjectId">;
  takeovers: Pick<TaskTakeoverDAO, "get" | "lastBuildBranch">;
  sessions: Pick<AgentSessionDAO, "getLatestClankerIdByTicket">;
}

/**
 * The task's branch, which its builds commit to, and who has the work now.
 * The branch a build pushed is the one; before any has, it's the name the
 * space's template gives the next build.
 */
export class TaskCodeBranchService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tickets: new TicketDAO(),
      scm: new ProjectScmConfigDAO(),
      takeovers: new TaskTakeoverDAO(),
      sessions: new AgentSessionDAO(),
      ...deps,
    };
  }

  /** Null when the task's space has no repository. */
  async describe(ticketId: string): Promise<TaskCodeBranch | null> {
    const ticket = await this.deps.tickets.getTicket(ticketId);
    const scm = ticket ? await this.deps.scm.getByProjectId(ticket.projectId) : null;
    if (!ticket || !scm?.sourceRepository.trim()) return null;
    const [pushed, takenOver, clankerId] = await Promise.all([
      this.deps.takeovers.lastBuildBranch(ticketId),
      this.deps.takeovers.get(ticketId),
      this.deps.sessions.getLatestClankerIdByTicket(ticketId),
    ]);
    const branch =
      pushed ?? buildFeatureBranchName("", ticket.id, ticket.externalTicketId || ticket.id, clankerId ?? undefined, scm.branchNameTemplate);
    return {
      branch,
      repositoryUrl: scm.sourceRepository.trim(),
      baseBranch: scm.baseBranch.trim() || "main",
      pushed: pushed !== null,
      takenOver,
    };
  }
}
