import { TICKET_STATUS } from "@viberglass/types";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import type { PullRequestOutcome } from "./pullRequestOutcomeTypes";

interface Dependencies {
  tasks: Pick<TaskPullRequestDAO, "listOpenTaskIds">;
  tickets: Pick<TicketDAO, "updateTicket">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/** Done is a merged pull request: a merge closes every open task it belongs to, with a quiet line saying so. */
export class TaskMergeCompleter {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tasks: new TaskPullRequestDAO(),
      tickets: new TicketDAO(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  async onOutcome(pullRequestUrl: string, outcome: PullRequestOutcome): Promise<void> {
    if (outcome.state !== "merged") return;
    for (const ticketId of await this.deps.tasks.listOpenTaskIds(pullRequestUrl)) {
      await this.deps.tickets.updateTicket(ticketId, { status: TICKET_STATUS.RESOLVED });
      await this.deps.activity.record(ticketId, { type: "system" }, "pull_request_merged", {
        pullRequestUrl,
        merged: true,
        ...(outcome.mergedBy && { mergedBy: outcome.mergedBy }),
      });
    }
  }
}
