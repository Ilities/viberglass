import { IntegrationDAO } from "../../../persistence/integrations";
import type { WebhookProvider } from "../../../persistence/webhook/WebhookConfigDAO";
import { integrationRegistry } from "../../../integrations/registerIntegrationPlugins";
import { webhookReceiversFrom, type WebhookReceivers } from "../../../webhooks/webhookReceivers";
import type { IntegrationWebhookProviderPolicy } from "./IntegrationWebhookProviderPolicy";
import { IntegrationRouteServiceError } from "./errors";
import { mapSystemToWebhookProvider } from "./shared";

interface IntegrationWithConfig {
  id: string;
  system: string;
  config: { [key: string]: unknown };
}

export interface ResolvedIntegrationWebhookContext {
  integration: IntegrationWithConfig;
  provider: WebhookProvider;
  providerPolicy: IntegrationWebhookProviderPolicy;
}

export class IntegrationWebhookContextResolver {
  constructor(
    private readonly integrationDAO = new IntegrationDAO(),
    private readonly receivers: WebhookReceivers = webhookReceiversFrom(integrationRegistry),
  ) {}

  async getIntegrationOrThrow(integrationId: string): Promise<IntegrationWithConfig> {
    const integration = await this.integrationDAO.getIntegration(integrationId);
    if (!integration) {
      throw new IntegrationRouteServiceError(404, "Integration not found");
    }

    return integration;
  }

  async resolveContextOrThrow(
    integrationId: string,
    unsupportedErrorMessage: string,
  ): Promise<ResolvedIntegrationWebhookContext> {
    const integration = await this.getIntegrationOrThrow(integrationId);
    const provider = mapSystemToWebhookProvider(integration.system);
    if (!provider) {
      throw new IntegrationRouteServiceError(400, unsupportedErrorMessage);
    }

    return {
      integration,
      provider,
      providerPolicy: this.resolveProviderPolicy(provider),
    };
  }

  resolveProviderPolicy(provider: WebhookProvider): IntegrationWebhookProviderPolicy {
    const receiver = this.receivers.get(provider);
    if (!receiver) {
      throw new Error(`No integration receives '${provider}' webhooks`);
    }
    return { provider, targetsOneSpace: receiver.targetsOneSpace };
  }
}
