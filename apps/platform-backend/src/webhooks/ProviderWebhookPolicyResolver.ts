import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";

type ProviderName = WebhookConfig["provider"];

interface RetryHeaderInput {
  deliveryId: string;
  eventType: string;
}

export interface ProviderWebhookPolicy {
  readonly provider: ProviderName;
  getSignatureHeader(headers: Record<string, string>): string | undefined;
  buildRetryHeaders(input: RetryHeaderInput): Record<string, string>;
}

class GitHubWebhookPolicy implements ProviderWebhookPolicy {
  readonly provider: ProviderName = "github";

  getSignatureHeader(headers: Record<string, string>): string | undefined {
    return headers["x-hub-signature-256"] || headers["x-hub-signature"];
  }

  buildRetryHeaders(input: RetryHeaderInput): Record<string, string> {
    return {
      "x-github-event": input.eventType.split(".")[0],
      "x-github-delivery": input.deliveryId,
    };
  }
}

class JiraWebhookPolicy implements ProviderWebhookPolicy {
  readonly provider: ProviderName = "jira";

  getSignatureHeader(headers: Record<string, string>): string | undefined {
    return headers["x-atlassian-webhook-signature"] || headers["x-hub-signature"];
  }

  buildRetryHeaders(input: RetryHeaderInput): Record<string, string> {
    return {
      "x-atlassian-webhook-identifier": input.deliveryId,
    };
  }
}

class ShortcutWebhookPolicy implements ProviderWebhookPolicy {
  readonly provider: ProviderName = "shortcut";

  getSignatureHeader(headers: Record<string, string>): string | undefined {
    return headers["payload-signature"];
  }

  buildRetryHeaders(input: RetryHeaderInput): Record<string, string> {
    return {
      "x-shortcut-delivery": input.deliveryId,
    };
  }
}

class CustomWebhookPolicy implements ProviderWebhookPolicy {
  readonly provider: ProviderName = "custom";

  getSignatureHeader(headers: Record<string, string>): string | undefined {
    return headers["x-webhook-signature-256"];
  }

  buildRetryHeaders(input: RetryHeaderInput): Record<string, string> {
    return {
      "x-webhook-delivery-id": input.deliveryId,
    };
  }
}

export class ProviderWebhookPolicyResolver {
  private policies = new Map<ProviderName, ProviderWebhookPolicy>();

  constructor(policies: ProviderWebhookPolicy[]) {
    for (const policy of policies) {
      this.policies.set(policy.provider, policy);
    }
  }

  resolve(provider: ProviderName): ProviderWebhookPolicy {
    const policy = this.policies.get(provider);
    if (!policy) {
      throw new Error(`No webhook policy registered for provider '${provider}'`);
    }

    return policy;
  }
}

export function createDefaultProviderWebhookPolicyResolver(): ProviderWebhookPolicyResolver {
  return new ProviderWebhookPolicyResolver([
    new GitHubWebhookPolicy(),
    new JiraWebhookPolicy(),
    new ShortcutWebhookPolicy(),
    new CustomWebhookPolicy(),
  ]);
}
