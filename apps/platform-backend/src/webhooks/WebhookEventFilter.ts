import type { ParsedWebhookEvent } from "./WebhookProvider";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";

export function isEventAllowed(
  event: ParsedWebhookEvent,
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

export function getAllowedEventCandidates(event: ParsedWebhookEvent): string[] {
  const candidates = new Set<string>([event.eventType]);
  const dotIndex = event.eventType.indexOf(".");

  if (dotIndex > 0) {
    candidates.add(event.eventType.slice(0, dotIndex));
  } else if (event.metadata.action) {
    candidates.add(`${event.eventType}.${event.metadata.action}`);
  }

  return Array.from(candidates);
}
