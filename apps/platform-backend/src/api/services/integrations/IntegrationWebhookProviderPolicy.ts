import type { WebhookProvider } from "../../../persistence/webhook/WebhookConfigDAO";

export interface IntegrationWebhookProviderPolicy {
  readonly provider: WebhookProvider;
  /**
   * Whether each of the connection's webhooks creates its tasks in a space of
   * its own. A tracker's connection has one webhook instead, and spaces choose
   * which of its issues they take.
   */
  readonly targetsOneSpace: boolean;
}
