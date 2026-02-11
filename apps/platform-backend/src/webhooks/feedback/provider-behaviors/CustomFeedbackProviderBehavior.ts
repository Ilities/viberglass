import { DefaultFeedbackProviderBehavior } from './DefaultFeedbackProviderBehavior';

export class CustomFeedbackProviderBehavior extends DefaultFeedbackProviderBehavior {
  readonly provider = 'custom';

  override supportsOutboundPosting(): boolean {
    return true;
  }

  override requiresExternalTicketId(): boolean {
    return false;
  }

  override requiresApiToken(): boolean {
    return false;
  }
}
