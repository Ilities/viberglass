import crypto from "crypto";
import logger from "../../config/logger";
import {
  ClawSchedule,
  ClawExecution,
  ClawEventType,
  ClawWebhookEvent,
} from "@viberglass/types";

export class ClawWebhookService {
  /**
   * Send a webhook notification for a claw event
   */
  async sendWebhook(
    schedule: ClawSchedule,
    execution: ClawExecution,
    eventType: ClawEventType,
    data?: { result?: Record<string, unknown>; errorMessage?: string },
  ): Promise<void> {
    if (!schedule.webhookConfig) {
      return; // No webhook configured
    }

    const { url, secret, events } = schedule.webhookConfig;

    // Check if this event type is enabled
    if (!events.includes(eventType)) {
      return;
    }

    try {
      const payload: ClawWebhookEvent = {
        eventType,
        executionId: execution.id,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        projectId: schedule.projectId,
        status: execution.status,
        result: data?.result ?? null,
        errorMessage: data?.errorMessage ?? null,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        timestamp: new Date().toISOString(),
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Viberglass-Claw/1.0",
      };

      if (secret) {
        // Simple HMAC signature
        const signature = crypto
          .createHmac("sha256", secret)
          .update(JSON.stringify(payload))
          .digest("hex");
        headers["X-Claw-Signature"] = `sha256=${signature}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "Unknown error");
        logger.warn("Claw webhook delivery failed", {
          scheduleId: schedule.id,
          executionId: execution.id,
          eventType,
          status: response.status,
          response: responseText,
        });
        throw new Error(
          `Webhook delivery failed: ${response.status} ${response.statusText}`,
        );
      }

      logger.info("Claw webhook delivered successfully", {
        scheduleId: schedule.id,
        executionId: execution.id,
        eventType,
        url,
      });
    } catch (error) {
      logger.error("Failed to send claw webhook", {
        scheduleId: schedule.id,
        executionId: execution.id,
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - webhook failures should not break the execution
    }
  }
}
