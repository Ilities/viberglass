import { DefaultIntegrationWebhookProviderPolicy } from "./DefaultIntegrationWebhookProviderPolicy";

export class JiraIntegrationWebhookProviderPolicy extends DefaultIntegrationWebhookProviderPolicy {
  constructor() {
    super("jira", {
      providerLabel: "Jira",
      useIntegrationProviderProjectIdFallback: false,
    });
  }
}
