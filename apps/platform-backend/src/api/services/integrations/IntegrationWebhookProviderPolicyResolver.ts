import type { WebhookProvider } from "../../../persistence/webhook/WebhookConfigDAO";
import { DefaultIntegrationWebhookProviderPolicy } from "./DefaultIntegrationWebhookProviderPolicy";
import { GitHubIntegrationWebhookProviderPolicy } from "./GitHubIntegrationWebhookProviderPolicy";
import type { IntegrationWebhookProviderPolicy } from "./IntegrationWebhookProviderPolicy";
import { JiraIntegrationWebhookProviderPolicy } from "./JiraIntegrationWebhookProviderPolicy";
import { ShortcutIntegrationWebhookProviderPolicy } from "./ShortcutIntegrationWebhookProviderPolicy";

export class IntegrationWebhookProviderPolicyResolver {
  private readonly policies = new Map<
    WebhookProvider,
    IntegrationWebhookProviderPolicy
  >();

  constructor(policies: IntegrationWebhookProviderPolicy[]) {
    for (const policy of policies) {
      this.policies.set(policy.provider, policy);
    }
  }

  resolve(provider: WebhookProvider): IntegrationWebhookProviderPolicy {
    const policy = this.policies.get(provider);
    if (!policy) {
      throw new Error(
        `No integration webhook provider policy registered for '${provider}'`,
      );
    }

    return policy;
  }
}

export function createDefaultIntegrationWebhookProviderPolicyResolver(): IntegrationWebhookProviderPolicyResolver {
  return new IntegrationWebhookProviderPolicyResolver([
    new GitHubIntegrationWebhookProviderPolicy(),
    new JiraIntegrationWebhookProviderPolicy(),
    new ShortcutIntegrationWebhookProviderPolicy(),
    new DefaultIntegrationWebhookProviderPolicy("custom", {
      providerLabel: "Custom",
    }),
  ]);
}
