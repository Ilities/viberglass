import type { ProviderType } from '../../WebhookProvider';
import type { FeedbackProviderBehavior } from './FeedbackProviderBehavior';

export class FeedbackProviderBehaviorResolver {
  private readonly defaultBehavior: FeedbackProviderBehavior;
  private readonly behaviors = new Map<ProviderType, FeedbackProviderBehavior>();

  constructor(behaviors: FeedbackProviderBehavior[]) {
    const defaultBehavior = behaviors.find((behavior) => behavior.provider === 'default');
    if (!defaultBehavior) {
      throw new Error('Feedback provider behavior resolver requires a default behavior');
    }

    this.defaultBehavior = defaultBehavior;
    for (const behavior of behaviors) {
      if (behavior.provider === 'default') {
        continue;
      }

      this.behaviors.set(behavior.provider, behavior);
    }
  }

  resolve(provider: ProviderType | undefined): FeedbackProviderBehavior {
    if (!provider) {
      return this.defaultBehavior;
    }

    return this.behaviors.get(provider) ?? this.defaultBehavior;
  }
}
