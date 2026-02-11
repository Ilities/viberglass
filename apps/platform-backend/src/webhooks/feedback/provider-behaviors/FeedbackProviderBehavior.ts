import type { WebhookConfig } from '../../../persistence/webhook/WebhookConfigDAO';
import type { ProviderType, WebhookProviderConfig } from '../../WebhookProvider';

export interface ExternalTicketResolutionContext {
  ticketExternalTicketId: string | undefined;
  ticketExternalTicketUrl: string | undefined;
  metadata: Record<string, unknown>;
}

export interface ProviderConfigOverrideContext {
  webhookConfig: WebhookConfig;
  ticketExternalTicketUrl: string | undefined;
  metadata: Record<string, unknown>;
}

export interface FeedbackProviderBehavior {
  readonly provider: ProviderType | 'default';
  supportsOutboundPosting(): boolean;
  unsupportedOutboundPostingMessage(provider: ProviderType): string;
  requiresExternalTicketId(): boolean;
  requiresApiToken(): boolean;
  requiresProviderProjectId(): boolean;
  maxRetryAttempts(): number;
  resolveExternalTicketId(context: ExternalTicketResolutionContext): string | undefined;
  resolveProviderConfigOverrides(
    context: ProviderConfigOverrideContext,
  ): Pick<WebhookProviderConfig, 'apiBaseUrl'>;
  validateProviderConfig(config: WebhookProviderConfig): string | undefined;
}
