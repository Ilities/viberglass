import type { WebhookProvider } from "../../../persistence/webhook/WebhookConfigDAO";
import type { IntegrationWebhookProviderPolicy } from "./IntegrationWebhookProviderPolicy";

interface DefaultIntegrationWebhookProviderPolicyOptions {
  providerLabel: string;
  alwaysOnOutboundEvents?: boolean;
  useIntegrationProviderProjectIdFallback?: boolean;
}

export class DefaultIntegrationWebhookProviderPolicy
  implements IntegrationWebhookProviderPolicy
{
  private readonly providerLabel: string;
  private readonly alwaysOnOutboundEvents: boolean;
  private readonly useIntegrationProviderProjectIdFallback: boolean;

  constructor(
    readonly provider: WebhookProvider,
    options: DefaultIntegrationWebhookProviderPolicyOptions,
  ) {
    this.providerLabel = options.providerLabel;
    this.alwaysOnOutboundEvents = options.alwaysOnOutboundEvents ?? false;
    this.useIntegrationProviderProjectIdFallback =
      options.useIntegrationProviderProjectIdFallback ?? true;
  }

  getProviderLabel(): string {
    return this.providerLabel;
  }

  shouldRequireAlwaysOnOutboundEvents(): boolean {
    return this.alwaysOnOutboundEvents;
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

    return this.toRecord(inputLabelMappings) || {};
  }

  protected toRecord(value: unknown): { [key: string]: unknown } | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    const normalized: { [key: string]: unknown } = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      normalized[key] = nestedValue;
    }

    return normalized;
  }
}
