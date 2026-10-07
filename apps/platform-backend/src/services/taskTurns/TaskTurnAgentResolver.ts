import { parseMentionedAgentIds, type Clanker } from "@viberglass/types";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ClankerReadinessService } from "../ClankerReadinessService";
import { DEFAULT_AGENT_SLUG } from "../setup/SetupAgentService";
import { TASK_TURN_ERROR_CODE, TaskTurnError } from "../errors/TaskTurnError";

interface Dependencies {
  sessions: Pick<AgentSessionDAO, "getLatestClankerIdByTicket">;
  clankers: Pick<ClankerDAO, "getClanker" | "getClankerBySlug" | "listClankers">;
  spaces: Pick<ProjectDAO, "getDefaultAgentIdForTicket">;
  readiness: Pick<ClankerReadinessService, "withReadiness">;
}

/** Which agent a turn would go to, and how it was picked. */
export interface ResolvedAgent {
  clanker: Clanker;
  /** Asked for or mentioned, already on the task, the space's default, the workspace default, or the first ready one. */
  via: "named" | "on_task" | "space_default" | "default" | "first_ready";
}

/** A missing key or login fails every run, so an agent without one is refused rather than started. */
function cannotAuthenticate(clanker: Clanker): boolean {
  const state = clanker.readiness?.state;
  return state === "needs_key" || state === "needs_login";
}

/**
 * Which agent a turn goes to: the one asked for, else the one mentioned, else
 * the agent already on the task, else the space's default agent, else the
 * workspace's default agent, else the first agent that is ready. Only a ready
 * agent is picked automatically.
 */
export class TaskTurnAgentResolver {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      sessions: new AgentSessionDAO(),
      clankers: new ClankerDAO(),
      spaces: new ProjectDAO(),
      readiness: new ClankerReadinessService(),
      ...deps,
    };
  }

  async resolve(ticketId: string, request: { agentId?: string; message: string }): Promise<string> {
    const resolved = await this.preview(ticketId, request);
    if (cannotAuthenticate(resolved.clanker)) {
      throw new TaskTurnError(
        TASK_TURN_ERROR_CODE.AGENT_NOT_READY,
        `${resolved.clanker.name} can't run yet. ${resolved.clanker.readiness?.problem ?? ""}`.trim(),
      );
    }
    return resolved.clanker.id;
  }

  /** The agent a turn would go to, without checking that it can authenticate. */
  async preview(ticketId: string, request: { agentId?: string; message: string } = { message: "" }): Promise<ResolvedAgent> {
    const named = request.agentId ?? parseMentionedAgentIds(request.message)[0];
    if (named) {
      const clanker = await this.deps.clankers.getClanker(named);
      if (!clanker) throw new TaskTurnError(TASK_TURN_ERROR_CODE.AGENT_NOT_FOUND, "That agent doesn't exist.");
      return { clanker: await this.withReadiness(clanker), via: "named" };
    }

    const onTaskId = await this.deps.sessions.getLatestClankerIdByTicket(ticketId);
    const onTask = onTaskId ? await this.deps.clankers.getClanker(onTaskId) : null;
    if (onTask) return { clanker: await this.withReadiness(onTask), via: "on_task" };

    const spaceDefaultId = await this.deps.spaces.getDefaultAgentIdForTicket(ticketId);
    const spaceDefaultAgent = spaceDefaultId ? await this.deps.clankers.getClanker(spaceDefaultId) : null;
    const spaceDefault = spaceDefaultAgent ? await this.withReadiness(spaceDefaultAgent) : null;
    if (spaceDefault?.readiness?.state === "ready") return { clanker: spaceDefault, via: "space_default" };

    const defaultAgent = await this.deps.clankers.getClankerBySlug(DEFAULT_AGENT_SLUG);
    const workspaceDefault = defaultAgent ? await this.withReadiness(defaultAgent) : null;
    if (workspaceDefault?.readiness?.state === "ready") return { clanker: workspaceDefault, via: "default" };
    const candidates = await this.deps.readiness.withReadiness(await this.deps.clankers.listClankers());
    const firstReady = candidates.find((clanker) => clanker.readiness?.state === "ready");
    if (firstReady) return { clanker: firstReady, via: "first_ready" };

    // The default people expect explains best why nothing could run.
    const expected = spaceDefault ?? workspaceDefault;
    const reason = expected?.readiness?.problem;
    throw new TaskTurnError(
      TASK_TURN_ERROR_CODE.NO_AGENT,
      candidates.length === 0 && !expected
        ? "There's no agent to ask yet. Set one up first."
        : `No agent is ready to run.${reason ? ` ${expected?.name}: ${reason}` : ""} Pick another agent, or fix its setup first.`,
    );
  }

  private async withReadiness(clanker: Clanker): Promise<Clanker> {
    const [withReadiness] = await this.deps.readiness.withReadiness([clanker]);
    return withReadiness;
  }
}
