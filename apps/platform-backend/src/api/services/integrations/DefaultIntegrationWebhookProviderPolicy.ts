import type { WebhookProvider } from "../../../persistence/webhook/WebhookConfigDAO";
import type { IntegrationWebhookProviderPolicy } from "./IntegrationWebhookProviderPolicy";

export class DefaultIntegrationWebhookProviderPolicy implements IntegrationWebhookProviderPolicy {
  constructor(
    readonly provider: WebhookProvider,
    readonly targetsOneSpace: boolean,
  ) {}
}
