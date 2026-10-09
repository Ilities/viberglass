import { isPartFinished, TICKET_STATUS } from "@viberglass/types";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import { TaskPartsService } from "../tasks/TaskPartsService";
import type { PullRequestOutcome } from "@viberglass/types";

interface Dependencies {
  tasks: Pick<TaskPullRequestDAO, "listOpenTaskIds">;
  tickets: Pick<TicketDAO, "getTicket" | "updateTicket">;
  parts: Pick<TaskPartsService, "state">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/**
 * Done is every part of the plan merged, done or skipped: a merge that finishes the plan closes
 * the task, with a quiet line saying so; a merge of an earlier part says which
 * part is next instead.
 */
export class TaskMergeCompleter {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tasks: new TaskPullRequestDAO(),
      tickets: new TicketDAO(),
      parts: new TaskPartsService(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  async onOutcome(pullRequestUrl: string, outcome: PullRequestOutcome): Promise<void> {
    if (outcome.state !== "merged") return;
    const mergedBy = outcome.mergedBy ? { mergedBy: outcome.mergedBy } : {};
    for (const ticketId of await this.deps.tasks.listOpenTaskIds(pullRequestUrl)) {
      const ticket = await this.deps.tickets.getTicket(ticketId);
      if (!ticket) continue;
      const { parts, next } = await this.deps.parts.state(ticket);
      const remaining = parts.filter((part) => !isPartFinished(part.status));
      if (remaining.length > 0) {
        await this.deps.activity.record(ticketId, { type: "system" }, "part_merged", {
          pullRequestUrl,
          parts: parts.filter((part) => part.pullRequestUrl === pullRequestUrl).map((part) => part.number),
          next,
          ...mergedBy,
        });
        continue;
      }
      await this.deps.tickets.updateTicket(ticketId, { status: TICKET_STATUS.RESOLVED });
      await this.deps.activity.record(ticketId, { type: "system" }, "pull_request_merged", { pullRequestUrl, merged: true, ...mergedBy });
    }
  }
}
