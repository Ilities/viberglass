import { TICKET_STATUS, type PullRequestOutcome } from "@viberglass/types";
import type { TaskTurnFactsDAO } from "../../persistence/agentSession/TaskTurnFactsDAO";
import type { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import type { PullRequestOutcomeListener } from "./pullRequestOutcomeTypes";

interface Dependencies {
  pullRequests: Pick<TaskPullRequestDAO, "listOpenTaskIds" | "listWithStates">;
  turns: Pick<TaskTurnFactsDAO, "running" | "lastFinished">;
  tickets: Pick<TicketDAO, "updateTicket">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/**
 * A task whose last open pull request is closed without merging is done, as
 * closed without merging. One with another pull request open or being built,
 * or that the agent worked on after the close, carries on.
 */
export class TaskUnmergedCloser implements PullRequestOutcomeListener {
  constructor(private readonly deps: Dependencies) {}

  async onOutcome(pullRequestUrl: string, outcome: PullRequestOutcome): Promise<void> {
    if (outcome.state !== "closed") return;
    for (const ticketId of await this.deps.pullRequests.listOpenTaskIds(pullRequestUrl)) {
      if (await this.carriesOn(ticketId, pullRequestUrl, outcome.closedAt)) continue;
      await this.deps.tickets.updateTicket(ticketId, { status: TICKET_STATUS.RESOLVED });
      await this.deps.activity.record(ticketId, { type: "system" }, "pull_request_closed", { pullRequestUrl, closedUnmerged: true });
    }
  }

  private async carriesOn(ticketId: string, pullRequestUrl: string, closedAt: Date | null): Promise<boolean> {
    const pullRequests = await this.deps.pullRequests.listWithStates(ticketId);
    // A branch without a URL is a build that hasn't opened its pull request yet; an unchecked one may still be open.
    if (pullRequests.some((pr) => pr.url !== pullRequestUrl && (pr.url === null || pr.state === null || pr.state === "open"))) return true;
    const [running, finished] = await Promise.all([this.deps.turns.running([ticketId]), this.deps.turns.lastFinished([ticketId])]);
    if (running.has(ticketId)) return true;
    const lastTurnAt = finished.get(ticketId)?.at;
    return Boolean(closedAt && lastTurnAt && lastTurnAt > closedAt);
  }
}
