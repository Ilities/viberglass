import type { InboundWebhookEvent, WebhookReceiver } from "@viberglass/integration-core";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import { IntegrationDAO } from "../persistence/integrations/IntegrationDAO";
import { ConnectionCredentialsResolver } from "../services/trackers/ConnectionCredentialsResolver";

/**
 * Fills in what a compact event leaves out, with the connection the webhook
 * belongs to. Events the receiver doesn't enrich, and webhooks without a
 * connection, pass through unchanged.
 */
export class WebhookEventEnricher {
  constructor(
    private readonly integrations: Pick<IntegrationDAO, "getIntegration"> = new IntegrationDAO(),
    private readonly credentials: Pick<ConnectionCredentialsResolver, "resolve"> = new ConnectionCredentialsResolver(),
  ) {}

  async enrich(event: InboundWebhookEvent, receiver: WebhookReceiver, config: WebhookConfig): Promise<InboundWebhookEvent> {
    if (!receiver.enrich || !config.integrationId) return event;
    const integration = await this.integrations.getIntegration(config.integrationId);
    if (!integration) return event;
    return receiver.enrich(event, await this.credentials.resolve(integration));
  }
}
