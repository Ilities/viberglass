import type { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import type { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import type { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import {
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_STATUS,
  AGENT_TURN_STATUS,
  type AgentSessionStatus,
} from "../../types/agentSession";
import { AGENT_SESSION_SERVICE_ERROR_CODE, AgentSessionServiceError } from "../errors/AgentSessionServiceError";
import { agentSessionMutex } from "./AgentSessionMutex";
import type { SessionJobStopper } from "./SessionJobStopper";

const ENDED: ReadonlySet<AgentSessionStatus> = new Set([
  AGENT_SESSION_STATUS.COMPLETED,
  AGENT_SESSION_STATUS.FAILED,
  AGENT_SESSION_STATUS.CANCELLED,
]);

/** Ends a session with the agent: the next ask on the task starts a new one, cold. */
export class AgentSessionCancellationService {
  constructor(
    private readonly sessions: Pick<AgentSessionDAO, "getById" | "update">,
    private readonly turns: Pick<AgentTurnDAO, "update">,
    private readonly events: Pick<AgentSessionEventDAO, "getMaxSequence" | "create">,
    private readonly jobStopper: SessionJobStopper,
  ) {}

  async cancel(sessionId: string, userId?: string): Promise<void> {
    return agentSessionMutex.runExclusive(sessionId, () => this.cancelExclusive(sessionId, userId));
  }

  private async cancelExclusive(sessionId: string, userId?: string): Promise<void> {
    const session = await this.sessions.getById(sessionId);
    if (!session) {
      throw new AgentSessionServiceError(AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND, "Session not found");
    }
    if (ENDED.has(session.status)) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        "Session is already in a terminal state",
      );
    }

    // Stop the worker first; otherwise it keeps running and can report a
    // result for a session the user already cancelled.
    if (session.lastJobId) await this.jobStopper.stopJob(session.lastJobId);
    if (session.lastTurnId) await this.turns.update(session.lastTurnId, { status: AGENT_TURN_STATUS.CANCELLED });

    await this.events.create({
      sessionId,
      sequence: (await this.events.getMaxSequence(sessionId)) + 1,
      eventType: AGENT_SESSION_EVENT_TYPE.SESSION_CANCELLED,
      payloadJson: { cancelledBy: userId ?? null },
    });
    await this.sessions.update(sessionId, { status: AGENT_SESSION_STATUS.CANCELLED, completedAt: new Date() });
  }
}
