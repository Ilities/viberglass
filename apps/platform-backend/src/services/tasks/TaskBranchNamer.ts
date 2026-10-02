import { buildFeatureBranchName } from "@viberglass/types";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { TaskBranchDAO } from "../../persistence/ticketing/TaskBranchDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";

interface Dependencies {
  branches: Pick<TaskBranchDAO, "get" | "claim">;
  tickets: Pick<TicketDAO, "getTicket">;
  scm: Pick<ProjectScmConfigDAO, "getByProjectId">;
  sessions: Pick<AgentSessionDAO, "getLatestClankerIdByTicket">;
}

/**
 * The task's branch name, decided the first time anything needs it (a build,
 * or someone taking the work over) from the space's branch template, and the
 * same from then on, whatever the template renders later.
 */
export class TaskBranchNamer {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      branches: new TaskBranchDAO(),
      tickets: new TicketDAO(),
      scm: new ProjectScmConfigDAO(),
      sessions: new AgentSessionDAO(),
      ...deps,
    };
  }

  /** `runId` fills a template's {{ jobId }}: the run the branch is first named for. */
  async nameFor(ticketId: string, runId: string): Promise<string | null> {
    const stored = await this.deps.branches.get(ticketId);
    if (stored) return stored;
    const ticket = await this.deps.tickets.getTicket(ticketId);
    if (!ticket) return null;
    const [scm, clankerId] = await Promise.all([
      this.deps.scm.getByProjectId(ticket.projectId),
      this.deps.sessions.getLatestClankerIdByTicket(ticketId),
    ]);
    const name = buildFeatureBranchName(runId, ticket.id, ticket.externalTicketId || ticket.id, clankerId ?? undefined, scm?.branchNameTemplate);
    return this.deps.branches.claim(ticketId, name);
  }
}
