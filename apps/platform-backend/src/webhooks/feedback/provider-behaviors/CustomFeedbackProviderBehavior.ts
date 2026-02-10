import { DefaultFeedbackProviderBehavior } from './DefaultFeedbackProviderBehavior';

export class CustomFeedbackProviderBehavior extends DefaultFeedbackProviderBehavior {
  readonly provider = 'custom';

  override supportsOutboundPosting(): boolean {
    return false;
  }

  override unsupportedOutboundPostingMessage(): string {
    return 'Custom provider does not support outbound posting';
  }
}
