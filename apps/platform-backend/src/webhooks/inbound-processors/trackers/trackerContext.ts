import type { WebhookConfig } from "../../../persistence/webhook/WebhookConfigDAO";
import type { TrackerContext } from "../../../services/trackers/TrackerIssueInbound";

export function trackerContext(provider: TrackerContext["provider"], projectId: string, config: WebhookConfig): TrackerContext {
  return { provider, projectId, integrationId: config.integrationId, webhookConfigId: config.id };
}
