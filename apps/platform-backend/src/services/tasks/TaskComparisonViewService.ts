import type { TaskComparison, TaskComparisonsView } from "@viberglass/types";
import type { TaskComparisonArmStatsDAO } from "../../persistence/ticketing/TaskComparisonArmStatsDAO";
import type { ComparisonRecord, TaskComparisonDAO } from "../../persistence/ticketing/TaskComparisonDAO";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";

interface Dependencies {
  comparisons: Pick<TaskComparisonDAO, "listForParent" | "listArms" | "armOf">;
  stats: Pick<TaskComparisonArmStatsDAO, "statsFor">;
  tickets: Pick<TicketDAO, "getTicket">;
}

/** A task's comparisons with each fork's progress side by side, and, on a fork, the comparison it belongs to. */
export class TaskComparisonViewService {
  constructor(private readonly deps: Dependencies) {}

  async view(ticketId: string): Promise<TaskComparisonsView> {
    const [records, arm] = await Promise.all([this.deps.comparisons.listForParent(ticketId), this.deps.comparisons.armOf(ticketId)]);
    return { comparisons: await this.withArms(records), armOf: arm ? await this.armOf(ticketId, arm) : null };
  }

  private async withArms(records: ComparisonRecord[]): Promise<TaskComparison[]> {
    const arms = await this.deps.comparisons.listArms(records.map((record) => record.id));
    const stats = await this.deps.stats.statsFor(arms.map((arm) => arm.ticketId));
    return records.map((record) => ({
      id: record.id,
      parentTicketId: record.parentTicketId,
      forkedAt: record.forkedAt.toISOString(),
      forkedFromTurnId: record.forkedFromTurnId,
      baseBranch: record.baseBranch,
      baseCommit: record.baseCommit,
      winnerTicketId: record.winnerTicketId,
      createdBy: record.createdBy,
      createdAt: record.createdAt.toISOString(),
      arms: arms
        .filter((arm) => arm.comparisonId === record.id)
        .flatMap((arm) => {
          const armStats = stats.get(arm.ticketId);
          if (!armStats) return [];
          return [
            {
              ticketId: arm.ticketId,
              key: arm.key,
              title: arm.title,
              status: arm.status,
              runner: { id: arm.runner.id, name: arm.runner.name },
              ...armStats,
            },
          ];
        }),
    }));
  }

  private async armOf(
    ticketId: string,
    arm: NonNullable<Awaited<ReturnType<TaskComparisonDAO["armOf"]>>>,
  ): Promise<TaskComparisonsView["armOf"]> {
    const parent = await this.deps.tickets.getTicket(arm.comparison.parentTicketId);
    if (!parent) return null;
    return {
      comparisonId: arm.comparison.id,
      parent: { id: parent.id, key: parent.key, title: parent.title },
      runner: { id: arm.runner.id, name: arm.runner.name },
      forkedAt: arm.comparison.forkedAt.toISOString(),
      winner: arm.comparison.winnerTicketId === ticketId,
    };
  }
}
