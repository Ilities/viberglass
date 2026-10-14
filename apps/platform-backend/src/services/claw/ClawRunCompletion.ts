import { isObjectRecord } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import { ClawScheduleDAO } from "../../persistence/claw/ClawScheduleDAO";
import { ClawExecutionService } from "./ClawExecutionService";
import { ClawWebhookService } from "./ClawWebhookService";

const logger = createChildLogger({ service: "ClawRunCompletion" });

export interface ClawJobOutcome {
  status: "completed" | "failed" | "cancelled";
  result?: Record<string, unknown>;
  errorMessage?: string;
}

/** Ends a scheduled run's execution when its job ends, however it ended. */
export class ClawRunCompletion {
  constructor(
    private readonly executions: Pick<ClawExecutionService, "recordExecutionResult"> = new ClawExecutionService(),
    private readonly schedules: Pick<ClawScheduleDAO, "getSchedule"> = new ClawScheduleDAO(),
    private readonly webhooks: Pick<ClawWebhookService, "sendWebhook"> = new ClawWebhookService(),
  ) {}

  /** Best effort: the job's own status is already saved, and must not fail because of this. */
  async finish(job: { id: string; context: unknown }, outcome: ClawJobOutcome): Promise<void> {
    const executionId = clawExecutionIdOf(job.context);
    if (!executionId) return;
    try {
      const execution = await this.executions.recordExecutionResult(executionId, { ...outcome, jobId: job.id });
      // Already ended, by the result callback or a sweeper; or cancelled, which webhooks have no event for.
      if (!execution || outcome.status === "cancelled") return;
      const schedule = await this.schedules.getSchedule(execution.scheduleId);
      if (!schedule) return;
      // Not awaited: a slow webhook endpoint must not hold up the callback or sweeper that ended the job.
      void this.webhooks.sendWebhook(
        schedule,
        execution,
        outcome.status,
        outcome.status === "completed" ? { result: outcome.result } : { errorMessage: outcome.errorMessage },
      );
    } catch (error) {
      logger.warn("Could not end a scheduled run after its job ended", {
        jobId: job.id,
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function clawExecutionIdOf(context: unknown): string | null {
  if (!isObjectRecord(context)) return null;
  return typeof context.clawExecutionId === "string" ? context.clawExecutionId : null;
}
