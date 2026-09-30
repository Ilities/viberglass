import type { WebhookConfig } from '../../persistence/webhook/WebhookConfigDAO';
import type { WebhookProviderConfig } from '../WebhookProvider';
import type { WebhookSecretService } from '../WebhookSecretService';
import type { IntegrationTokenSource } from './IntegrationCredentialTokenSource';
import type { FeedbackProviderBehavior } from './provider-behaviors';

/**
 * The token outbound feedback posts with. Providers whose connection already
 * holds a token use it, so a person enters one token per connection; a token
 * stored on the feedback settings themselves still works as a fallback.
 */
export class FeedbackApiTokenResolver {
  constructor(
    private readonly secretService: Pick<WebhookSecretService, 'getApiToken'>,
    private readonly integrationTokens: IntegrationTokenSource,
  ) {}

  async resolve(
    behavior: FeedbackProviderBehavior,
    config: Pick<WebhookConfig, 'integrationId'>,
    providerConfig: WebhookProviderConfig,
  ): Promise<string> {
    if (behavior.usesIntegrationCredential() && config.integrationId) {
      const token = await this.integrationTokens.resolveDefaultToken(config.integrationId);
      if (token) return token;
    }
    return this.secretService.getApiToken(providerConfig);
  }
}
