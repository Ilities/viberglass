import type { WebhookProvider } from "../../../persistence/webhook/WebhookConfigDAO";
import { DefaultIntegrationWebhookProviderPolicy } from "./DefaultIntegrationWebhookProviderPolicy";
import type { IntegrationWebhookProviderPolicy } from "./IntegrationWebhookProviderPolicy";

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
    new DefaultIntegrationWebhookProviderPolicy("github", false),
    new DefaultIntegrationWebhookProviderPolicy("jira", false),
    new DefaultIntegrationWebhookProviderPolicy("shortcut", false),
    new DefaultIntegrationWebhookProviderPolicy("custom", true),
  ]);
}
