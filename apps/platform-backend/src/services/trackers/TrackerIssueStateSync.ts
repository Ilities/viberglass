import { TICKET_STATUS, type InboundIssueStateChange } from "@viberglass/types";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import { TicketLifecycleStatusService } from "../TicketLifecycleStatusService";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket" | "updateTicket">;
  lifecycle: Pick<TicketLifecycleStatusService, "synchronize">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/**
 * Follows the linked issue's state: closing it marks each of its tasks done,
 * and reopening it reopens the ones that are done. The Activity names the
 * tracker as the change's source, so it isn't posted back to the issue.
 */
export class TrackerIssueStateSync {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tickets: new TicketDAO(),
      lifecycle: new TicketLifecycleStatusService(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  async apply(provider: string, ticketIds: string[], change: InboundIssueStateChange): Promise<void> {
    for (const ticketId of ticketIds) {
      const ticket = await this.deps.tickets.getTicket(ticketId);
      if (!ticket) continue;
      const done = ticket.status === TICKET_STATUS.RESOLVED;
      if (change === "closed" && !done) {
        await this.deps.tickets.updateTicket(ticketId, { status: TICKET_STATUS.RESOLVED });
        await this.deps.activity.record(ticketId, { type: "system" }, "task_done", { source: provider });
      } else if (change === "reopened" && done) {
        await this.deps.tickets.updateTicket(ticketId, { status: TICKET_STATUS.OPEN });
        await this.deps.lifecycle.synchronize(ticketId);
        await this.deps.activity.record(ticketId, { type: "system" }, "task_reopened", { source: provider });
      }
    }
  }
}
