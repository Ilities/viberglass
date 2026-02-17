import type { WebhookProvider } from "../../../persistence/webhook/WebhookConfigDAO";

export interface IntegrationWebhookProviderPolicy {
  readonly provider: WebhookProvider;

  getProviderLabel(): string;
  shouldRequireAlwaysOnOutboundEvents(): boolean;
  shouldUseIntegrationProviderProjectIdFallback(): boolean;
  validateProviderProjectId(providerProjectId: string | null): void;
  normalizeInboundLabelMappings(
    inputLabelMappings: { [key: string]: unknown } | undefined,
    existingLabelMappings?: { [key: string]: unknown },
  ): { [key: string]: unknown };
}
