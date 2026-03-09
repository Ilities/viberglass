import cron from "node-cron";
import logger from "../../config/logger";
import { ClawScheduleDAO } from "../../persistence/claw/ClawScheduleDAO";
import { ClawOrchestrationService } from "./ClawOrchestrationService";
import { ClawSchedule, intervalToCron } from "@viberglass/types";

interface ScheduledTask {
  id: string;
  schedule: ClawSchedule;
  cronTask: cron.ScheduledTask;
}

/**
 * ClawSchedulingEngine manages the execution of scheduled claw tasks
 * It's a singleton that maintains cron jobs for all active schedules
 */
export class ClawSchedulingEngine {
  private static instance: ClawSchedulingEngine | null = null;
  private scheduleDAO: ClawScheduleDAO;
  private orchestrationService: ClawOrchestrationService;
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  private constructor() {
    this.scheduleDAO = new ClawScheduleDAO();
    this.orchestrationService = new ClawOrchestrationService();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ClawSchedulingEngine {
    if (!ClawSchedulingEngine.instance) {
      ClawSchedulingEngine.instance = new ClawSchedulingEngine();
    }
    return ClawSchedulingEngine.instance;
  }

  /**
   * Start the scheduling engine
   * This loads all active schedules and sets up periodic refresh
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("ClawSchedulingEngine already running");
      return;
    }

    logger.info("Starting ClawSchedulingEngine");

    this.isRunning = true;

    await this.refreshFromDatabase();

    this.refreshInterval = setInterval(
      () => {
        this.refreshFromDatabase().catch((error) => {
          logger.error("Failed to refresh claw schedules", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
      5 * 60 * 1000, // 5 minutes
    );

    logger.info("ClawSchedulingEngine started", {
      activeSchedules: this.scheduledTasks.size,
    });
  }

  /**
   * Stop the scheduling engine
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn("ClawSchedulingEngine not running");
      return;
    }

    logger.info("Stopping ClawSchedulingEngine");

    this.isRunning = false;

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    for (const [_id, task] of this.scheduledTasks) {
      task.cronTask.stop();
    }
    this.scheduledTasks.clear();

    logger.info("ClawSchedulingEngine stopped");
  }

  /**
   * Refresh schedules from database
   * Adds new schedules, updates existing ones, and removes inactive ones
   */
  async refreshFromDatabase(): Promise<void> {
    try {
      const activeSchedules = await this.scheduleDAO.getActiveSchedules();

      logger.debug("Refreshing claw schedules", {
        activeSchedules: activeSchedules.length,
        currentTasks: this.scheduledTasks.size,
      });

      const scheduleIdsInDb = new Set<string>();

      for (const schedule of activeSchedules) {
        scheduleIdsInDb.add(schedule.id);

        const existingTask = this.scheduledTasks.get(schedule.id);

        if (!existingTask) {
          this.addSchedule(schedule);
        } else if (
          existingTask.schedule.cronExpression !== schedule.cronExpression ||
          existingTask.schedule.intervalExpression !==
            schedule.intervalExpression ||
          existingTask.schedule.timezone !== schedule.timezone
        ) {
          this.removeSchedule(schedule.id);
          this.addSchedule(schedule);
        }
      }

      for (const [id] of this.scheduledTasks) {
        if (!scheduleIdsInDb.has(id)) {
          this.removeSchedule(id);
        }
      }

      logger.debug("Claw schedules refreshed", {
        activeSchedules: this.scheduledTasks.size,
      });
    } catch (error) {
      logger.error("Failed to refresh claw schedules from database", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Add a schedule to the engine
   */
  private addSchedule(schedule: ClawSchedule): void {
    try {
      const cronExpression = this.getCronExpression(schedule);
      if (!cronExpression) {
        logger.warn("Invalid cron expression for schedule", {
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          scheduleType: schedule.scheduleType,
          intervalExpression: schedule.intervalExpression,
          cronExpression: schedule.cronExpression,
        });
        return;
      }

      const cronTask = cron.schedule(
        cronExpression,
        () => {
          this.executeScheduledTask(schedule.id).catch((error) => {
            logger.error("Failed to execute scheduled claw task", {
              scheduleId: schedule.id,
              scheduleName: schedule.name,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        },
        {
          scheduled: true,
          timezone: schedule.timezone,
        },
      );

      this.scheduledTasks.set(schedule.id, {
        id: schedule.id,
        schedule,
        cronTask,
      });

      logger.info("Claw schedule added to engine", {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        cronExpression,
        timezone: schedule.timezone,
      });
    } catch (error) {
      logger.error("Failed to add claw schedule to engine", {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Remove a schedule from the engine
   */
  private removeSchedule(scheduleId: string): void {
    const task = this.scheduledTasks.get(scheduleId);
    if (task) {
      task.cronTask.stop();
      this.scheduledTasks.delete(scheduleId);

      logger.info("Claw schedule removed from engine", {
        scheduleId,
        scheduleName: task.schedule.name,
      });
    }
  }

  /**
   * Get the cron expression for a schedule
   * Handles both interval and cron types
   */
  private getCronExpression(schedule: ClawSchedule): string | null {
    if (schedule.scheduleType === "cron" && schedule.cronExpression) {
      return schedule.cronExpression;
    }

    if (schedule.scheduleType === "interval" && schedule.intervalExpression) {
      return intervalToCron(schedule.intervalExpression);
    }

    return null;
  }

  /**
   * Execute a scheduled task
   * Called by cron when a schedule fires
   */
  private async executeScheduledTask(scheduleId: string): Promise<void> {
    logger.info("Executing scheduled claw task", { scheduleId });

    try {
      await this.orchestrationService.executeScheduledTask(scheduleId);
    } catch (error) {
      logger.error("Failed to execute scheduled claw task", {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - errors are logged and handled in orchestration
    }
  }

  /**
   * Get the current status of the scheduling engine
   */
  getStatus(): { isRunning: boolean; activeSchedules: number } {
    return {
      isRunning: this.isRunning,
      activeSchedules: this.scheduledTasks.size,
    };
  }

  /**
   * Manually trigger a schedule refresh
   * Useful after creating/updating a schedule via API
   */
  async triggerRefresh(): Promise<void> {
    await this.refreshFromDatabase();
  }
}
