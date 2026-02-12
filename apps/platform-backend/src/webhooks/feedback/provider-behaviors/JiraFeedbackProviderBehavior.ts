import type { WebhookProviderConfig } from '../../WebhookProvider';
import { resolveJiraApiBaseUrl, resolveJiraIssueKey } from '../../feedbackHelpers';
import { DefaultFeedbackProviderBehavior } from './DefaultFeedbackProviderBehavior';
import type {
  ExternalTicketResolutionContext,
  ProviderConfigOverrideContext,
} from './FeedbackProviderBehavior';

export class JiraFeedbackProviderBehavior extends DefaultFeedbackProviderBehavior {
  readonly provider = 'jira';

  override requiresProviderProjectId(): boolean {
    return true;
  }

  override resolveExternalTicketId(context: ExternalTicketResolutionContext): string | undefined {
    return resolveJiraIssueKey(
      context.ticketExternalTicketId,
      context.metadata.externalTicketId,
      context.metadata.issueKey,
      context.metadata.jiraIssueKey,
      context.metadata.issueNumber,
      context.metadata.externalTicketUrl,
      context.ticketExternalTicketUrl,
    );
  }

  override resolveProviderConfigOverrides(
    context: ProviderConfigOverrideContext,
  ): Pick<WebhookProviderConfig, 'apiBaseUrl'> {
    const labelMappings = context.webhookConfig.labelMappings as Record<string, unknown> | undefined;
    return {
      apiBaseUrl: resolveJiraApiBaseUrl(
        labelMappings?.apiBaseUrl,
        labelMappings?.instanceUrl,
        context.metadata.jiraApiBaseUrl,
        context.metadata.jiraIssueApiUrl,
        context.metadata.instanceUrl,
        context.metadata.externalTicketUrl,
        context.ticketExternalTicketUrl,
      ),
    };
  }

  override validateProviderConfig(config: WebhookProviderConfig): string | undefined {
    if (config.apiBaseUrl) {
      return undefined;
    }

    return "Provider 'jira' outbound configuration requires Jira instanceUrl/apiBaseUrl context";
  }
}
