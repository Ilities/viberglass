import type { IntegrationRegistry, WebhookReceiver } from "@viberglass/integration-core";

/** The integrations that receive webhooks, by the provider name their webhooks are stored under. */
export interface WebhookReceivers {
  get(provider: string): WebhookReceiver | undefined;
  providers(): string[];
}

export function webhookReceiversFrom(registry: Pick<IntegrationRegistry, "list">): WebhookReceivers {
  const byProvider = new Map<string, WebhookReceiver>();
  for (const plugin of registry.list()) {
    if (plugin.webhookProvider && plugin.webhook) byProvider.set(plugin.webhookProvider, plugin.webhook);
  }
  return {
    get: (provider) => byProvider.get(provider),
    providers: () => Array.from(byProvider.keys()),
  };
}
