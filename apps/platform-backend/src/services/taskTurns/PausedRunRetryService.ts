import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { TaskTurnFactsDAO } from "../../persistence/agentSession/TaskTurnFactsDAO";
import { AGENT_SESSION_STATUS } from "../../types/agentSession";
import { TaskSteeringService } from "./TaskSteeringService";

interface Dependencies {
  sessions: Pick<AgentSessionDAO, "listByStatuses">;
  facts: Pick<TaskTurnFactsDAO, "lastFinished">;
  steering: Pick<TaskSteeringService, "resume">;
}

/**
 * The tasks whose agent a setup failure paused (a credential, the repository,
 * the runner), and trying them all again once an admin has fixed it.
 */
export class PausedRunRetryService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      sessions: new AgentSessionDAO(),
      facts: new TaskTurnFactsDAO(),
      steering: new TaskSteeringService(),
      ...deps,
    };
  }

  async pausedTaskIds(): Promise<string[]> {
    const paused = [...new Set((await this.deps.sessions.listByStatuses([AGENT_SESSION_STATUS.PAUSED])).map((session) => session.ticketId))];
    const lastTurns = await this.deps.facts.lastFinished(paused);
    return paused.filter((ticketId) => {
      const last = lastTurns.get(ticketId);
      return last?.status === "failed" && last.failure?.category === "setup";
    });
  }

  /** Returns how many tasks it tried again. */
  async retryAll(actorId: string): Promise<number> {
    const ticketIds = await this.pausedTaskIds();
    for (const ticketId of ticketIds) await this.deps.steering.resume(ticketId, actorId);
    return ticketIds.length;
  }
}
