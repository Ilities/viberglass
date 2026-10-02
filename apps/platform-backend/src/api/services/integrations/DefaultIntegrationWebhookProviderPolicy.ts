import { isObjectRecord } from "@viberglass/types";
import type { WebhookProvider } from "../../../persistence/webhook/WebhookConfigDAO";
import type { IntegrationWebhookProviderPolicy } from "./IntegrationWebhookProviderPolicy";

interface DefaultIntegrationWebhookProviderPolicyOptions {
  providerLabel: string;
  useIntegrationProviderProjectIdFallback?: boolean;
}

export class DefaultIntegrationWebhookProviderPolicy
  implements IntegrationWebhookProviderPolicy
{
  private readonly providerLabel: string;
  private readonly useIntegrationProviderProjectIdFallback: boolean;

  constructor(
    readonly provider: WebhookProvider,
    options: DefaultIntegrationWebhookProviderPolicyOptions,
  ) {
    this.providerLabel = options.providerLabel;
    this.useIntegrationProviderProjectIdFallback =
      options.useIntegrationProviderProjectIdFallback ?? true;
  }

  getProviderLabel(): string {
    return this.providerLabel;
  }

  shouldUseIntegrationProviderProjectIdFallback(): boolean {
    return this.useIntegrationProviderProjectIdFallback;
  }

  validateProviderProjectId(_providerProjectId: string | null): void {}

  normalizeInboundLabelMappings(
    inputLabelMappings: { [key: string]: unknown } | undefined,
    existingLabelMappings?: { [key: string]: unknown },
  ): { [key: string]: unknown } {
    if (inputLabelMappings === undefined) {
      return existingLabelMappings || {};
    }

    return this.normalizeRecord(inputLabelMappings) || {};
  }

  protected normalizeRecord(
    value: unknown,
  ): { [key: string]: unknown } | undefined {
    if (!isObjectRecord(value)) {
      return undefined;
    }

    const normalized: { [key: string]: unknown } = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      normalized[key] = nestedValue;
    }

    return normalized;
  }
}
