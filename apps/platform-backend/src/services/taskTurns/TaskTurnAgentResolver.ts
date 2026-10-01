import { parseMentionedAgentIds } from "@viberglass/types";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { DEFAULT_AGENT_SLUG } from "../setup/SetupAgentService";
import { TASK_TURN_ERROR_CODE, TaskTurnError } from "../errors/TaskTurnError";

interface Dependencies {
  sessions: Pick<AgentSessionDAO, "getLatestClankerIdByTicket">;
  clankers: Pick<ClankerDAO, "getClanker" | "getClankerBySlug" | "listClankers">;
}

/**
 * Which agent a turn goes to: the one asked for, else the one mentioned, else
 * the agent already on the task, else the workspace's default agent, else the
 * first agent that can run.
 */
export class TaskTurnAgentResolver {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { sessions: new AgentSessionDAO(), clankers: new ClankerDAO(), ...deps };
  }

  async resolve(ticketId: string, request: { agentId?: string; message: string }): Promise<string> {
    const named = request.agentId ?? parseMentionedAgentIds(request.message)[0];
    if (named) {
      if (!(await this.deps.clankers.getClanker(named))) {
        throw new TaskTurnError(TASK_TURN_ERROR_CODE.AGENT_NOT_FOUND, "That agent doesn't exist.");
      }
      return named;
    }

    const onTask = await this.deps.sessions.getLatestClankerIdByTicket(ticketId);
    if (onTask) return onTask;

    const fallback = await this.deps.clankers.getClankerBySlug(DEFAULT_AGENT_SLUG);
    if (fallback?.deploymentStrategyId) return fallback.id;
    const runnable = (await this.deps.clankers.listClankers()).find(
      (clanker) => clanker.status === "active" && clanker.deploymentStrategyId,
    );
    if (!runnable) {
      throw new TaskTurnError(TASK_TURN_ERROR_CODE.NO_AGENT, "There's no agent to ask yet. Set one up first.");
    }
    return runnable.id;
  }
}
