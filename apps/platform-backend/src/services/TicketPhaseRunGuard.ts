import type { TicketWorkflowPhase } from "@viberglass/types";
import { AgentSessionDAO } from "../persistence/agentSession/AgentSessionDAO";
import { TicketPhaseRunDAO } from "../persistence/ticketing/TicketPhaseRunDAO";
import {
  TICKET_SERVICE_ERROR_CODE,
  TicketServiceError,
} from "./errors/TicketServiceError";

interface ActiveJobLookup {
  findActiveJobId(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<string | null>;
}

interface ActiveSessionLookup {
  getActiveByTicketAndMode(
    ticketId: string,
    mode: TicketWorkflowPhase,
  ): Promise<{ id: string } | null>;
}

/**
 * Keeps one agent at a time working on a ticket phase: a new run, revision
 * or live session is refused while a job is queued or running, or a session
 * is open, for the same ticket and phase.
 */
export class TicketPhaseRunGuard {
  constructor(
    private readonly jobs: ActiveJobLookup = new TicketPhaseRunDAO(),
    private readonly sessions: ActiveSessionLookup = new AgentSessionDAO(),
  ) {}

  /** Describes what is already working on the phase, or null if nothing is. */
  async findConflict(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<string | null> {
    if (await this.sessions.getActiveByTicketAndMode(ticketId, phase)) {
      return `A live ${phase} session is already open for this ticket. Continue it or end it first.`;
    }
    if (await this.jobs.findActiveJobId(ticketId, phase)) {
      return `A ${phase} run is already in progress for this ticket. Wait for it to finish or cancel it first.`;
    }
    return null;
  }

  async assertIdle(ticketId: string, phase: TicketWorkflowPhase): Promise<void> {
    const conflict = await this.findConflict(ticketId, phase);
    if (conflict) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.PHASE_RUN_IN_PROGRESS,
        conflict,
      );
    }
  }
}
