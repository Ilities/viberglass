import type { WebhookConfig } from '../../persistence/webhook/WebhookConfigDAO';
import type {
  WebhookProvider,
  WebhookProviderConfig,
} from '../WebhookProvider';
import type { OutboundWebhookEventType } from './types';

export function toProviderConfig(
  dbConfig: WebhookConfig,
  providerProjectId?: string,
  apiBaseUrl?: string,
): WebhookProviderConfig {
  return {
    type: dbConfig.provider,
    secretLocation: dbConfig.secretLocation,
    secretPath: dbConfig.secretPath || undefined,
    algorithm: 'sha256',
    allowedEvents: dbConfig.allowedEvents,
    webhookSecret: dbConfig.webhookSecretEncrypted || undefined,
    apiToken: dbConfig.apiTokenEncrypted || undefined,
    providerProjectId: dbConfig.providerProjectId || providerProjectId || undefined,
    apiBaseUrl,
    labelMappings: dbConfig.labelMappings || undefined,
  };
}

export function createProviderInstance(
  provider: WebhookProvider,
  providerConfig: WebhookProviderConfig,
): WebhookProvider {
  const ProviderConstructor = provider.constructor as new (
    config: WebhookProviderConfig,
  ) => WebhookProvider;
  return new ProviderConstructor(providerConfig);
}

export function isEventEnabled(
  allowedEvents: string[] | undefined,
  event: OutboundWebhookEventType,
): boolean {
  if (!allowedEvents || allowedEvents.length === 0) {
    return true;
  }

  return allowedEvents.some((allowed) => {
    if (allowed === '*') return true;
    if (allowed === event) return true;
    if (allowed.endsWith('*')) {
      return event.startsWith(allowed.slice(0, -1));
    }
    return false;
  });
}
