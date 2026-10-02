import { DefaultIntegrationWebhookProviderPolicy } from "./DefaultIntegrationWebhookProviderPolicy";

export class ShortcutIntegrationWebhookProviderPolicy extends DefaultIntegrationWebhookProviderPolicy {
  constructor() {
    super("shortcut", {
      providerLabel: "Shortcut",
      useIntegrationProviderProjectIdFallback: false,
    });
  }
}
