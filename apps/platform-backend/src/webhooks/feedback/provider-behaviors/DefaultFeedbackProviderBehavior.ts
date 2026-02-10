import type { ProviderType, WebhookProviderConfig } from '../../WebhookProvider';
import {
  resolveExternalTicketId,
} from '../../feedbackHelpers';
import type {
  ExternalTicketResolutionContext,
  FeedbackProviderBehavior,
  ProviderConfigOverrideContext,
} from './FeedbackProviderBehavior';

export class DefaultFeedbackProviderBehavior implements FeedbackProviderBehavior {
  readonly provider: FeedbackProviderBehavior['provider'] = 'default';

  supportsOutboundPosting(): boolean {
    return true;
  }

  unsupportedOutboundPostingMessage(provider: ProviderType): string {
    return `Provider '${provider}' does not support outbound posting`;
  }

  requiresProviderProjectId(): boolean {
    return false;
  }

  maxRetryAttempts(): number {
    return 1;
  }

  resolveExternalTicketId(context: ExternalTicketResolutionContext): string | undefined {
    return resolveExternalTicketId(
      context.ticketExternalTicketId,
      context.metadata.externalTicketId,
      context.metadata.issueKey,
      context.metadata.issueNumber,
    );
  }

  resolveProviderConfigOverrides(
    _context: ProviderConfigOverrideContext,
  ): Pick<WebhookProviderConfig, 'apiBaseUrl'> {
    return {};
  }

  validateProviderConfig(_config: WebhookProviderConfig): string | undefined {
    return undefined;
  }
}
