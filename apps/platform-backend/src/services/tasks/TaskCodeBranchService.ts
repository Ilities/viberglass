import type { TaskCodeBranch } from "@viberglass/types";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { TaskTakeoverDAO } from "../../persistence/ticketing/TaskTakeoverDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TaskBranchNamer } from "./TaskBranchNamer";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket">;
  scm: Pick<ProjectScmConfigDAO, "getByProjectId">;
  takeovers: Pick<TaskTakeoverDAO, "get" | "lastBuildBranch">;
  namer: Pick<TaskBranchNamer, "nameFor">;
}

/**
 * The task's branch, which its builds commit to, and who has the work now.
 * Asking names the branch if nothing has yet, so the next build uses the same.
 */
export class TaskCodeBranchService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tickets: new TicketDAO(),
      scm: new ProjectScmConfigDAO(),
      takeovers: new TaskTakeoverDAO(),
      namer: new TaskBranchNamer(),
      ...deps,
    };
  }

  /** Null when the task's space has no repository. */
  async describe(ticketId: string): Promise<TaskCodeBranch | null> {
    const ticket = await this.deps.tickets.getTicket(ticketId);
    const scm = ticket ? await this.deps.scm.getByProjectId(ticket.projectId) : null;
    if (!ticket || !scm?.sourceRepository.trim()) return null;
    const [branch, pushed, takenOver] = await Promise.all([
      this.deps.namer.nameFor(ticketId, ticketId),
      this.deps.takeovers.lastBuildBranch(ticketId),
      this.deps.takeovers.get(ticketId),
    ]);
    return {
      branch: branch ?? pushed ?? "",
      repositoryUrl: scm.sourceRepository.trim(),
      baseBranch: scm.baseBranch.trim() || "main",
      pushed: pushed !== null,
      takenOver,
    };
  }
}
