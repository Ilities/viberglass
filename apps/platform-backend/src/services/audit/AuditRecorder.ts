import type { AuditAction, AuditTargetType } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import { AuditLogDAO } from "../../persistence/audit/AuditLogDAO";
import { currentActorId, currentRequestIp, currentSlackUserId } from "../../api/auth/requestActor";

const logger = createChildLogger({ service: "AuditRecorder" });

export interface AuditEvent {
  action: AuditAction;
  target: { type: AuditTargetType; id: string | null };
  /** Listed, safe facts only: never request bodies or secret values. */
  details?: Record<string, unknown>;
  /** Who acted, and from where; default to the current request's. */
  actorId?: string | null;
  ip?: string | null;
}

/**
 * Appends to the workspace audit log (J17). A failure to record is logged and
 * never fails the change it describes.
 */
export class AuditRecorder {
  constructor(private readonly log: Pick<AuditLogDAO, "record"> = new AuditLogDAO()) {}

  async record(event: AuditEvent): Promise<void> {
    // A Slack action says so, and names the Slack user even when nobody linked that account.
    const slackUserId = currentSlackUserId();
    const details = slackUserId ? { ...event.details, via: "slack", slackUserId } : (event.details ?? {});
    try {
      await this.log.record({
        actorId: event.actorId === undefined ? currentActorId() : event.actorId,
        action: event.action,
        targetType: event.target.type,
        targetId: event.target.id,
        details,
        ip: event.ip === undefined ? currentRequestIp() : event.ip,
      });
    } catch (error) {
      logger.warn("Failed to record audit entry", {
        action: event.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
