import { TICKET_STATUS } from "@viberglass/types";
import type { TaskComparisonDAO } from "../../persistence/ticketing/TaskComparisonDAO";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { RecordedActivity } from "../notifications/NotificationService";
import type { ActivityListener } from "./activityListeners";
import type { TaskActivityRecorder } from "./TaskActivityRecorder";
import type { TaskDoneService } from "./TaskDoneService";

interface Dependencies {
  comparisons: Pick<TaskComparisonDAO, "armOf" | "listArms" | "setWinner">;
  tickets: Pick<TicketDAO, "getTicket" | "updateTicket">;
  activity: Pick<TaskActivityRecorder, "record">;
  done: Pick<TaskDoneService, "finish">;
}

/**
 * A fork whose pull request merged decides its comparison: the original is
 * done with that fork's work, the fork is the one picked unless someone picked
 * already, and the forks still open are finished as not picked. Their pull
 * requests stay open on the code host for people to close.
 */
export class ComparisonMergeFinisher implements ActivityListener {
  constructor(private readonly deps: Dependencies) {}

  async onActivity({ ticketId, kind, payload }: RecordedActivity): Promise<void> {
    if (kind !== "pull_request_merged") return;
    const arm = await this.deps.comparisons.armOf(ticketId);
    if (!arm) return;
    const { comparison } = arm;
    const arms = await this.deps.comparisons.listArms([comparison.id]);
    const merged = arms.find((candidate) => candidate.ticketId === ticketId);
    if (!merged) return;

    if (!comparison.winnerTicketId) await this.deps.comparisons.setWinner(comparison.id, ticketId);
    const parent = await this.deps.tickets.getTicket(comparison.parentTicketId);
    if (parent && parent.status !== TICKET_STATUS.RESOLVED) {
      await this.deps.tickets.updateTicket(parent.id, { status: TICKET_STATUS.RESOLVED });
      await this.deps.activity.record(parent.id, { type: "system" }, "pull_request_merged", { ...payload, fork: merged.key });
    }
    for (const other of arms) {
      if (other.ticketId === ticketId || other.status === TICKET_STATUS.RESOLVED) continue;
      await this.deps.done.finish(other.ticketId, { type: "system" }, { notPicked: true, picked: merged.key });
    }
  }
}
