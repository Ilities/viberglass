import { TicketPhaseRunDAO } from "../persistence/ticketing/TicketPhaseRunDAO";
import {
  TICKET_SERVICE_ERROR_CODE,
  TicketServiceError,
} from "./errors/TicketServiceError";

interface ActiveJobLookup {
  findActiveJobIdForTicket(ticketId: string): Promise<string | null>;
}

/**
 * Refuses to change a task's steps under a working agent: while any of its
 * runs is queued or running. A session between turns isn't working.
 */
export class TicketPhaseRunGuard {
  constructor(private readonly jobs: ActiveJobLookup = new TicketPhaseRunDAO()) {}

  /** Describes what is already working on the task, or null if nothing is. */
  async findConflict(ticketId: string): Promise<string | null> {
    if (await this.jobs.findActiveJobIdForTicket(ticketId)) {
      return "The agent is working on this task. Wait for it to finish or cancel it first.";
    }
    return null;
  }

  async assertIdle(ticketId: string): Promise<void> {
    const conflict = await this.findConflict(ticketId);
    if (conflict) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.PHASE_RUN_IN_PROGRESS,
        conflict,
      );
    }
  }
}
