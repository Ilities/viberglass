import type { InboundWebhookEvent } from "@viberglass/integration-core";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";

/** Why the webhook doesn't take the event: it's switched off, or isn't set to receive it. Null when it takes it. */
export function eventRefusal(event: InboundWebhookEvent, config: WebhookConfig): string | null {
  if (!config.active) {
    return `Webhook configuration '${config.id}' is inactive`;
  }
  if (!isEventAllowed(event, config)) {
    return `The webhook isn't set to receive '${getAllowedEventCandidates(event).join(", ")}'`;
  }
  return null;
}

function isEventAllowed(
  event: InboundWebhookEvent,
  config: WebhookConfig,
): boolean {
  if (!config.allowedEvents || config.allowedEvents.length === 0) {
    return true;
  }

  const allowedEvents = new Set(config.allowedEvents);
  if (allowedEvents.has("*")) {
    return true;
  }

  const candidates = getAllowedEventCandidates(event);
  return candidates.some((candidate) => allowedEvents.has(candidate));
}

function getAllowedEventCandidates(event: InboundWebhookEvent): string[] {
  const candidates = new Set<string>([event.eventType]);
  const dotIndex = event.eventType.indexOf(".");

  if (dotIndex > 0) {
    candidates.add(event.eventType.slice(0, dotIndex));
  } else if (event.metadata.action) {
    candidates.add(`${event.eventType}.${event.metadata.action}`);
  }

  return Array.from(candidates);
}
