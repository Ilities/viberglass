import type { TaskActivityKind } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import { TaskActivityDAO } from "../../persistence/ticketing/TaskActivityDAO";
import { currentActorId } from "../../api/auth/requestActor";
import { NotificationService } from "../notifications/NotificationService";
import { AuditActivityListener } from "../audit/AuditActivityListener";
import { registeredActivityListeners, type ActivityListener } from "./activityListeners";

export type { ActivityListener };

const logger = createChildLogger({ service: "TaskActivityRecorder" });

export type ActivityActor = { type: "human"; userId: string | null } | { type: "agent" } | { type: "system" };

/**
 * Writes a task's Activity from the services that make each change, then tells
 * its listeners (notifications, the audit log). A failure to record or to notify is logged,
 * never allowed to undo or fail the change itself.
 */
export class TaskActivityRecorder {
  constructor(
    private readonly activity: Pick<TaskActivityDAO, "record"> = new TaskActivityDAO(),
    private readonly listeners: ActivityListener[] = [new NotificationService(), new AuditActivityListener()],
  ) {}

  /** Records the change as made by whoever is behind the current request, else by the system. */
  async recordByCurrentActor(ticketId: string, kind: TaskActivityKind, payload: Record<string, unknown> = {}): Promise<void> {
    const userId = currentActorId();
    await this.record(ticketId, userId ? { type: "human", userId } : { type: "system" }, kind, payload);
  }

  async record(ticketId: string, actor: ActivityActor, kind: TaskActivityKind, payload: Record<string, unknown> = {}): Promise<void> {
    const actorId = actor.type === "human" ? actor.userId : null;
    try {
      await this.activity.record({ ticketId, actorType: actor.type, actorId, kind, payload });
    } catch (error) {
      logger.warn("Failed to record task activity", {
        ticketId,
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    for (const listener of [...this.listeners, ...registeredActivityListeners()]) {
      try {
        await listener.onActivity({ ticketId, kind, actorId, payload });
      } catch (error) {
        logger.warn("Task activity listener failed", {
          ticketId,
          kind,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
