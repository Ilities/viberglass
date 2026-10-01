import type { RecordedActivity } from "../notifications/NotificationService";
import { AuditRecorder } from "./AuditRecorder";

/**
 * Puts the task changes the audit log covers (runs started and cancelled,
 * approvals) in it, from the same call that writes the task's Activity, so
 * the two can't disagree.
 */
export class AuditActivityListener {
  constructor(private readonly audit: Pick<AuditRecorder, "record"> = new AuditRecorder()) {}

  async onActivity(activity: RecordedActivity): Promise<void> {
    const details = { taskId: activity.ticketId, step: activity.payload.step };
    const run = typeof activity.payload.jobId === "string" ? activity.payload.jobId : null;
    switch (activity.kind) {
      case "run_started":
        return this.audit.record({ action: "run.started", target: { type: "run", id: run }, details, actorId: activity.actorId });
      case "run_cancelled":
        return this.audit.record({ action: "run.cancelled", target: { type: "run", id: run }, details, actorId: activity.actorId });
      case "document_approved":
        return this.audit.record({ action: "approval.granted", target: { type: "approval", id: activity.ticketId }, details, actorId: activity.actorId });
      default:
        return;
    }
  }
}
