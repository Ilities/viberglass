import type { WebhookConfig } from "../../../persistence/webhook/WebhookConfigDAO";
import type { TrackerContext } from "../../../services/trackers/TrackerIssueInbound";

/** The connection a tracker webhook belongs to; null for a webhook that has lost its connection. */
export function trackerContext(provider: TrackerContext["provider"], config: WebhookConfig): TrackerContext | null {
  return config.integrationId ? { provider, integrationId: config.integrationId, webhookConfigId: config.id } : null;
}

export const NO_CONNECTION = { ignoredReason: "The webhook isn't part of a connection" };
