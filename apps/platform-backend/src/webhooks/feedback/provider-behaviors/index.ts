import { CustomFeedbackProviderBehavior } from './CustomFeedbackProviderBehavior';
import { DefaultFeedbackProviderBehavior } from './DefaultFeedbackProviderBehavior';
import { FeedbackProviderBehaviorResolver } from './FeedbackProviderBehaviorResolver';
import { GitHubFeedbackProviderBehavior } from './GitHubFeedbackProviderBehavior';
import { JiraFeedbackProviderBehavior } from './JiraFeedbackProviderBehavior';
import { ShortcutFeedbackProviderBehavior } from './ShortcutFeedbackProviderBehavior';

export { FeedbackProviderBehaviorResolver } from './FeedbackProviderBehaviorResolver';
export type {
  ExternalTicketResolutionContext,
  FeedbackProviderBehavior,
  ProviderConfigOverrideContext,
} from './FeedbackProviderBehavior';

export function createDefaultFeedbackProviderBehaviorResolver(): FeedbackProviderBehaviorResolver {
  return new FeedbackProviderBehaviorResolver([
    new DefaultFeedbackProviderBehavior(),
    new GitHubFeedbackProviderBehavior(),
    new JiraFeedbackProviderBehavior(),
    new ShortcutFeedbackProviderBehavior(),
    new CustomFeedbackProviderBehavior(),
  ]);
}
