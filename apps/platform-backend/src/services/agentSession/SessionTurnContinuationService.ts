import logger from "../../config/logger";
import type { AgentSession, AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import type { AgentTurn, AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import type { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import {
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_STATUS,
  AGENT_TURN_ROLE,
  AGENT_TURN_STATUS,
} from "../../types/agentSession";
import { AGENT_SESSION_SERVICE_ERROR_CODE, AgentSessionServiceError } from "../errors/AgentSessionServiceError";
import { TaskTurnContextLoader } from "../taskTurns/TaskTurnContextLoader";
import { TaskTurnJobDispatcher } from "../taskTurns/TaskTurnJobDispatcher";
import { TaskTurnPromptBuilder } from "../taskTurns/TaskTurnPromptBuilder";
import { actionForPending } from "../taskTurns/turnActions";

export interface ReplyResult {
  currentTurn: AgentTurn;
  job: { id: string | null; status: string };
}

export interface LaunchPendingOptions {
  /** Clear session.latestPendingRequestId (reply/approve flows) */
  clearPendingRequest?: boolean;
}

interface Collaborators {
  tickets: Pick<TicketDAO, "getTicket">;
  context: Pick<TaskTurnContextLoader, "load">;
  prompts: Pick<TaskTurnPromptBuilder, "build">;
  dispatcher: Pick<TaskTurnJobDispatcher, "dispatch">;
}

/**
 * Launches a session's next turn. Every turn answers ALL the messages people
 * sent since the last one, in one batch: users can send messages anytime, and
 * each worker job carries everything said since the previous turn.
 *
 * All public methods expect the caller to hold the per-session mutex
 * (AgentSessionMutex) — they deliberately do not lock themselves because
 * they are invoked from within already-locked flows.
 */
export class SessionTurnContinuationService {
  private readonly deps: Collaborators;

  constructor(
    private readonly agentSessionDAO: Pick<AgentSessionDAO, "getById" | "update">,
    private readonly agentTurnDAO: Pick<AgentTurnDAO, "listUnconsumedUserTurns" | "nextSequence" | "create" | "markConsumed" | "update">,
    private readonly agentSessionEventDAO: Pick<AgentSessionEventDAO, "getMaxSequence" | "create">,
    deps: Partial<Collaborators> = {},
  ) {
    this.deps = {
      tickets: new TicketDAO(),
      context: deps.context ?? new TaskTurnContextLoader(),
      prompts: new TaskTurnPromptBuilder(),
      dispatcher: deps.dispatcher ?? new TaskTurnJobDispatcher(),
      ...deps,
    };
  }

  /**
   * Batch every unconsumed user turn of the session into one assistant turn
   * and launch its worker job. Returns null when there is nothing pending.
   */
  async launchForPendingMessages(session: AgentSession, options: LaunchPendingOptions = {}): Promise<ReplyResult | null> {
    const pending = await this.agentTurnDAO.listUnconsumedUserTurns(session.id);
    if (pending.length === 0) return null;
    const ticket = await this.deps.tickets.getTicket(session.ticketId);
    if (!ticket) {
      throw new AgentSessionServiceError(AGENT_SESSION_SERVICE_ERROR_CODE.TICKET_NOT_FOUND, "Ticket not found");
    }

    const action = actionForPending(pending.map((turn) => turn.action));
    // Code is written only when someone asked for it; TaskTurnService.ask lets only those who may ask for code.
    const allowCode = action === "code";
    const turn = await this.agentTurnDAO.create({
      sessionId: session.id,
      role: AGENT_TURN_ROLE.ASSISTANT,
      sequence: await this.agentTurnDAO.nextSequence(session.id),
      status: AGENT_TURN_STATUS.QUEUED,
      action,
    });
    await this.agentTurnDAO.markConsumed(pending.map((entry) => entry.id), turn.id);

    try {
      const context = await this.deps.context.load({
        ticket,
        sessionId: session.id,
        turnId: turn.id,
        action,
        sessionMessages: pending.filter((entry) => !entry.taskMessageId),
      });
      const prompts = await this.deps.prompts.build(ticket.projectId, context, action, allowCode);
      const job = await this.deps.dispatcher.dispatch(
        {
          session,
          turnId: turn.id,
          action,
          allowCode,
          prompts,
          ticket,
          documents: context.documents,
          summary: context.summary,
          lastAgentCommit: context.lastAgentCommit,
        },
        async (submitted) => {
          await this.agentTurnDAO.update(turn.id, { jobId: submitted.id });
          await this.agentSessionEventDAO.create({
            sessionId: session.id,
            turnId: turn.id,
            sequence: (await this.agentSessionEventDAO.getMaxSequence(session.id)) + 1,
            eventType: AGENT_SESSION_EVENT_TYPE.TURN_STARTED,
            payloadJson: { turnId: turn.id, action, fullPrompt: submitted.prompt },
          });
          await this.agentSessionDAO.update(session.id, {
            status: AGENT_SESSION_STATUS.ACTIVE,
            lastJobId: submitted.id,
            lastTurnId: turn.id,
            ...(options.clearPendingRequest ? { latestPendingRequestId: null } : {}),
          });
        },
      );
      return { currentTurn: turn, job: { id: job.id, status: job.status } };
    } catch (error) {
      // The turn never reached a worker; leave it failed rather than in flight forever.
      await this.agentTurnDAO.update(turn.id, { status: AGENT_TURN_STATUS.FAILED, completedAt: new Date() });
      throw error;
    }
  }

  /**
   * Launch a continuation for messages queued while a turn was running.
   * No-op unless the session is ACTIVE with unconsumed user turns —
   * e.g. skipped when the agent is waiting on input/approval or the
   * session reached a terminal state. Returns whether a turn was launched.
   */
  async drainQueuedMessages(sessionId: string): Promise<boolean> {
    const session = await this.agentSessionDAO.getById(sessionId);
    if (!session || session.status !== AGENT_SESSION_STATUS.ACTIVE) return false;
    try {
      return (await this.launchForPendingMessages(session)) !== null;
    } catch (error) {
      // The turn that just ended is reported either way; the queued messages wait for the next ask.
      logger.error("Could not launch the turn for queued messages", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
