import type { DeliveryStatus } from "../persistence/webhook/WebhookDeliveryDAO";

/** A rejected delivery is never retried: its signature didn't check out, and nothing it carried was kept. */
export function isRetryableDelivery(status: DeliveryStatus): boolean {
  return status === "failed" || status === "ignored";
}
