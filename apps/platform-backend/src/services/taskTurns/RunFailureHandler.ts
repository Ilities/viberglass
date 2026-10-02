import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import {
  AGENT_SESSION_ACTIVE_STATUSES,
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_STATUS,
  AGENT_TURN_STATUS,
} from "../../types/agentSession";
import { agentSessionMutex } from "../agentSession/AgentSessionMutex";
import type { RecordedActivity } from "../notifications/NotificationService";
import type { ActivityListener } from "../tasks/activityListeners";

interface Dependencies {
  turns: Pick<AgentTurnDAO, "getByJobId" | "update">;
  sessions: Pick<AgentSessionDAO, "getById" | "update">;
  events: Pick<AgentSessionEventDAO, "getMaxSequence" | "create">;
}

const IN_FLIGHT = new Set<string>([AGENT_TURN_STATUS.QUEUED, AGENT_TURN_STATUS.RUNNING]);

/**
 * What a failed run means for the task's agent. A run that failed without
 * its worker reporting (no runner could start it, it stopped answering) still
 * had a turn running; that turn ends. A setup failure (a credential, the
 * repository, the runner) pauses the agent rather than leaving it failed, so
 * what people ask waits until someone fixes it and tries again.
 */
export class RunFailureHandler implements ActivityListener {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      turns: new AgentTurnDAO(),
      sessions: new AgentSessionDAO(),
      events: new AgentSessionEventDAO(),
      ...deps,
    };
  }

  async onActivity({ kind, payload }: RecordedActivity): Promise<void> {
    const jobId = payload.jobId;
    if (kind !== "run_failed" || typeof jobId !== "string") return;
    const turn = await this.deps.turns.getByJobId(jobId);
    if (!turn) return;
    const setup = payload.category === "setup";

    await agentSessionMutex.runExclusive(turn.sessionId, async () => {
      const session = await this.deps.sessions.getById(turn.sessionId);
      if (!session || !AGENT_SESSION_ACTIVE_STATUSES.includes(session.status)) return;
      const stranded = IN_FLIGHT.has(turn.status);
      if (stranded) {
        await this.deps.turns.update(turn.id, { status: AGENT_TURN_STATUS.FAILED, completedAt: new Date() });
        await this.deps.events.create({
          sessionId: session.id,
          turnId: turn.id,
          sequence: (await this.deps.events.getMaxSequence(session.id)) + 1,
          eventType: AGENT_SESSION_EVENT_TYPE.TURN_FAILED,
          payloadJson: { reason: typeof payload.reason === "string" ? payload.reason : "The run failed", jobId },
        });
      }
      if (setup) await this.deps.sessions.update(session.id, { status: AGENT_SESSION_STATUS.PAUSED });
      // Only a turn ended here leaves the session waiting; one the worker reported may already have started the next.
      else if (stranded && session.status === AGENT_SESSION_STATUS.ACTIVE) await this.deps.sessions.update(session.id, { status: AGENT_SESSION_STATUS.WAITING_ON_USER });
    });
  }
}
