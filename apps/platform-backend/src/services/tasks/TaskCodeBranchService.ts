import type { TaskCodeBranch } from "@viberglass/types";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { TaskTakeoverDAO } from "../../persistence/ticketing/TaskTakeoverDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TaskBranchNamer } from "./TaskBranchNamer";
import { TaskPartsService } from "./TaskPartsService";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket">;
  scm: Pick<ProjectScmConfigDAO, "getByProjectId">;
  takeovers: Pick<TaskTakeoverDAO, "get" | "lastBuildBranch">;
  namer: Pick<TaskBranchNamer, "current" | "preview">;
  parts: Pick<TaskPartsService, "state">;
}

/**
 * The task's branch, which its builds commit to, and who has the work now.
 * Looking only says the name its first build would get; taking the work over
 * names it, for the parts left to build, so the next build uses the same.
 */
export class TaskCodeBranchService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tickets: new TicketDAO(),
      scm: new ProjectScmConfigDAO(),
      takeovers: new TaskTakeoverDAO(),
      namer: new TaskBranchNamer(),
      parts: new TaskPartsService(),
      ...deps,
    };
  }

  /** Null when the task's space has no repository. With `claim`, a task without a branch gets one. */
  async describe(ticketId: string, { claim = false }: { claim?: boolean } = {}): Promise<TaskCodeBranch | null> {
    const ticket = await this.deps.tickets.getTicket(ticketId);
    const scm = ticket ? await this.deps.scm.getByProjectId(ticket.projectId) : null;
    if (!ticket || !scm?.sourceRepository.trim()) return null;
    const [branch, pushed, takenOver] = await Promise.all([
      claim ? this.claim(ticketId) : this.deps.namer.preview(ticketId, ticketId),
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

  /** For the parts left, as a build asked for without parts: claimed for the whole plan, every part would read as being built. */
  private async claim(ticketId: string): Promise<string | null> {
    const { next } = await this.deps.parts.state({ id: ticketId });
    return this.deps.namer.current(ticketId, ticketId, { first: next ?? 1, last: null });
  }
}
