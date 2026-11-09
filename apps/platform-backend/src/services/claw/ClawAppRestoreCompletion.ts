import { createChildLogger } from "../../config/logger";
import { ClawScheduleDAO } from "../../persistence/claw/ClawScheduleDAO";
import type { DataRestoreReporter } from "../apps/AppDataMaintenance";
import { ClawExecutionService } from "./ClawExecutionService";
import { ClawWebhookService } from "./ClawWebhookService";

const logger = createChildLogger({ service: "ClawAppRestoreCompletion" });

/** Ends a scheduled restore's run once the app's data is back, or isn't; a failure pauses the schedule, as for other actions. */
export class ClawAppRestoreCompletion implements DataRestoreReporter {
  constructor(
    private readonly executions: Pick<ClawExecutionService, "recordExecutionResult"> = new ClawExecutionService(),
    private readonly schedules: Pick<ClawScheduleDAO, "getSchedule" | "pauseSchedule"> = new ClawScheduleDAO(),
    private readonly webhooks: Pick<ClawWebhookService, "sendWebhook"> = new ClawWebhookService(),
  ) {}

  async finish(executionId: string, failure: string | null): Promise<void> {
    const data = failure ? { errorMessage: failure } : { result: { restored: true } };
    const execution = await this.executions.recordExecutionResult(executionId, { status: failure ? "failed" : "completed", ...data });
    if (!execution) return;
    if (failure) {
      await this.schedules.pauseSchedule(execution.scheduleId);
      logger.warn("Schedule paused after its restore of the app's data failed", { scheduleId: execution.scheduleId });
    }
    const schedule = await this.schedules.getSchedule(execution.scheduleId);
    // Not awaited: a slow webhook endpoint must not hold up the app's sweep.
    if (schedule) void this.webhooks.sendWebhook(schedule, execution, failure ? "failed" : "completed", data);
  }
}
