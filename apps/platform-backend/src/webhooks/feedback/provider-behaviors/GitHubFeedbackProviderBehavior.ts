import { DefaultFeedbackProviderBehavior } from './DefaultFeedbackProviderBehavior';

const GITHUB_MAX_ATTEMPTS = 3;

export class GitHubFeedbackProviderBehavior extends DefaultFeedbackProviderBehavior {
  readonly provider = 'github';

  override requiresProviderProjectId(): boolean {
    return true;
  }

  override maxRetryAttempts(): number {
    return GITHUB_MAX_ATTEMPTS;
  }
}
