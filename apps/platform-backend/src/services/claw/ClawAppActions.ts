import type { ClawExecution, ClawSchedule } from "@viberglass/types";
import logger from "../../config/logger";
import { ClawScheduleDAO } from "../../persistence/claw/ClawScheduleDAO";
import type { AppBackupService } from "../apps/AppBackupService";
import { appHosting } from "../apps/createAppHosting";
import type { AppService } from "../apps/AppService";
import { CLAW_SERVICE_ERROR_CODE, ClawServiceError } from "../errors/ClawServiceError";
import { ClawExecutionService } from "./ClawExecutionService";
import { ClawWebhookService } from "./ClawWebhookService";

/**
 * A schedule's action on an App space's app, without a job: its power is
 * recorded, or a restore of its data ordered, and the app's reconciler does the rest.
 */
export class ClawAppActions {
  constructor(
    private readonly appPower: () => Pick<AppService, "setPower"> = () => appHosting().service,
    private readonly appData: () => Pick<AppBackupService, "orderRestore"> = () => appHosting().backups,
    private readonly executions: Pick<ClawExecutionService, "recordExecutionResult" | "markStarted"> = new ClawExecutionService(),
    private readonly schedules: Pick<ClawScheduleDAO, "updateLastRun"> = new ClawScheduleDAO(),
    private readonly webhooks: Pick<ClawWebhookService, "sendWebhook"> = new ClawWebhookService(),
  ) {}

  async run(schedule: ClawSchedule, execution: ClawExecution): Promise<void> {
    await this.webhooks.sendWebhook(schedule, execution, "started");
    if (schedule.action === "app_restore_data") return this.restoreData(schedule, execution);

    const power = schedule.action === "app_start" ? "on" : "off";
    await this.appPower().setPower(schedule.projectId, power);
    await this.schedules.updateLastRun(schedule.id, new Date());
    await this.complete(schedule, execution, { status: "completed", result: { power } });
    logger.info("Scheduled app power change recorded", { scheduleId: schedule.id, projectId: schedule.projectId, power });
  }

  /** The run stays open until the reconciler has put the data back. */
  private async restoreData(schedule: ClawSchedule, execution: ClawExecution): Promise<void> {
    if (!schedule.backupId) throw new ClawServiceError(CLAW_SERVICE_ERROR_CODE.BACKUP_NOT_FOUND, "Backup not found");
    await this.executions.markStarted(execution.id);
    const ordered = await this.appData().orderRestore(schedule.projectId, schedule.backupId, execution.id);
    await this.schedules.updateLastRun(schedule.id, new Date());
    if (!ordered) {
      await this.complete(schedule, execution, { status: "cancelled", errorMessage: "The previous restore hadn't run yet, so this one was skipped." });
      return;
    }
    logger.info("Scheduled restore of an app's data ordered", { scheduleId: schedule.id, projectId: schedule.projectId, backupId: schedule.backupId });
  }

  private async complete(
    schedule: ClawSchedule,
    execution: ClawExecution,
    outcome: { status: "completed"; result: Record<string, unknown> } | { status: "cancelled"; errorMessage: string },
  ): Promise<void> {
    const finished = await this.executions.recordExecutionResult(execution.id, outcome);
    if (finished && outcome.status === "completed") await this.webhooks.sendWebhook(schedule, finished, "completed", { result: outcome.result });
  }
}
