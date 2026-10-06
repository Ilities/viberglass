import { buildFeatureBranchName, type PartRange } from "@viberglass/types";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { TaskBranchDAO } from "../../persistence/ticketing/TaskBranchDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";

const WHOLE_PLAN: PartRange = { first: 1, last: null };

interface Dependencies {
  branches: Pick<TaskBranchDAO, "get" | "claim">;
  tickets: Pick<TicketDAO, "getTicket">;
  scm: Pick<ProjectScmConfigDAO, "getByProjectId">;
  sessions: Pick<AgentSessionDAO, "getLatestClankerIdByTicket">;
}

/**
 * Names the branch of each of a task's pull requests the first time anything
 * needs it (a build, or someone taking the work over) from the space's branch
 * template, and keeps it from then on, whatever the template renders later. A
 * later part's branch is the first's name with `-part-N`.
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

  /**
   * The branch a build goes to: the open pull request's, else a new one for
   * `parts`. `runId` fills a template's {{ jobId }}: the run the branch is first named for.
   */
  async nameFor(ticketId: string, runId: string, parts: PartRange = WHOLE_PLAN): Promise<string | null> {
    const ticket = await this.deps.tickets.getTicket(ticketId);
    if (!ticket) return null;
    const [scm, clankerId] = await Promise.all([
      this.deps.scm.getByProjectId(ticket.projectId),
      this.deps.sessions.getLatestClankerIdByTicket(ticketId),
    ]);
    const name = buildFeatureBranchName(runId, ticket.id, ticket.externalTicketId || ticket.id, clankerId ?? undefined, scm?.branchNameTemplate);
    return this.deps.branches.claim(ticketId, parts.first > 1 ? `${name}-part-${parts.first}` : name, parts);
  }

  /** The task's latest branch, named now if it has none: where someone taking the work over pushes. */
  async current(ticketId: string, runId: string): Promise<string | null> {
    return (await this.existing(ticketId)) ?? this.nameFor(ticketId, runId);
  }

  /** The task's latest branch, without naming one. */
  async existing(ticketId: string): Promise<string | null> {
    return this.deps.branches.get(ticketId);
  }
}
