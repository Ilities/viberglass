import type { InboundIssueStateChange } from "@viberglass/types";
import { TaskDoneService } from "../tasks/TaskDoneService";

interface Dependencies {
  done: Pick<TaskDoneService, "finish" | "reopen">;
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
      done: new TaskDoneService(),
      ...deps,
    };
  }

  async apply(provider: string, ticketIds: string[], change: InboundIssueStateChange): Promise<void> {
    for (const ticketId of ticketIds) {
      if (change === "closed") await this.deps.done.finish(ticketId, { type: "system" }, { source: provider });
      else if (change === "reopened") await this.deps.done.reopen(ticketId, { type: "system" }, { source: provider });
    }
  }
}
