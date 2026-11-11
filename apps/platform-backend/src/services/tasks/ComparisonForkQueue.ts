import { createChildLogger } from "../../config/logger";
import type { TaskTurnFactsDAO } from "../../persistence/agentSession/TaskTurnFactsDAO";
import type { TaskComparisonDAO } from "../../persistence/ticketing/TaskComparisonDAO";
import type { RecordedActivity } from "../notifications/NotificationService";
import type { TaskTurnService } from "../taskTurns/TaskTurnService";
import type { ActivityListener } from "./activityListeners";

const logger = createChildLogger({ service: "ComparisonForkQueue" });

const RUN_ENDED = new Set(["run_finished", "run_failed", "run_cancelled"]);

interface Dependencies {
  comparisons: Pick<TaskComparisonDAO, "get" | "armOf" | "listArms" | "claimNextWaiting">;
  turns: Pick<TaskTurnService, "ask">;
  running: Pick<TaskTurnFactsDAO, "running">;
}

/**
 * Runs a comparison's forks one after another: the next fork is asked when a
 * fork's run ends. Forks often share a provider's rate limit or the runner's
 * machine, and started together they ran into both.
 */
export class ComparisonForkQueue implements ActivityListener {
  constructor(private readonly deps: Dependencies) {}

  async onActivity({ ticketId, kind }: RecordedActivity): Promise<void> {
    if (!RUN_ENDED.has(kind)) return;
    const arm = await this.deps.comparisons.armOf(ticketId);
    if (arm) await this.startNext(arm.comparison.id, ticketId);
  }

  /** Asks the next waiting fork, unless a fork other than `endedTicketId` is still working. A fork that can't start is skipped. */
  async startNext(comparisonId: string, endedTicketId: string | null = null): Promise<void> {
    const comparison = await this.deps.comparisons.get(comparisonId);
    if (!comparison) return;
    const arms = await this.deps.comparisons.listArms([comparisonId]);
    if (!arms.some((arm) => arm.waiting)) return;
    const started = arms.filter((arm) => !arm.waiting && arm.ticketId !== endedTicketId).map((arm) => arm.ticketId);
    if ((await this.deps.running.running(started)).size > 0) return;

    const finished = new Set(arms.filter((arm) => arm.status === "resolved").map((arm) => arm.ticketId));
    for (let next = await this.deps.comparisons.claimNextWaiting(comparisonId); next; next = await this.deps.comparisons.claimNextWaiting(comparisonId)) {
      if (finished.has(next.ticketId)) continue;
      try {
        await this.deps.turns.ask(next.ticketId, comparison.createdBy?.id ?? null, { ...comparison.ask, agentId: next.clankerId });
        return;
      } catch (error) {
        logger.warn("A comparison fork couldn't start", { comparisonId, ticketId: next.ticketId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}
