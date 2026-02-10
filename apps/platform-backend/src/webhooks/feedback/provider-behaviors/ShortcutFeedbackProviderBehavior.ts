import { resolveExternalTicketId } from '../../feedbackHelpers';
import { DefaultFeedbackProviderBehavior } from './DefaultFeedbackProviderBehavior';
import type { ExternalTicketResolutionContext } from './FeedbackProviderBehavior';

export class ShortcutFeedbackProviderBehavior extends DefaultFeedbackProviderBehavior {
  readonly provider = 'shortcut';

  override maxRetryAttempts(): number {
    return 2;
  }

  override resolveExternalTicketId(context: ExternalTicketResolutionContext): string | undefined {
    return resolveExternalTicketId(
      context.ticketExternalTicketId,
      context.metadata.externalTicketId,
      context.metadata.storyId,
      context.metadata.shortcutStoryId,
      context.metadata.issueKey,
      context.metadata.issueNumber,
    );
  }
}
