import { ShortcutPayloadParser } from './ShortcutPayloadParser';
import type { ShortcutWebhookProviderDependencies } from './shortcutDependencies';

export function createShortcutWebhookProviderDependencies(): ShortcutWebhookProviderDependencies {
  return {
    payloadParser: new ShortcutPayloadParser(),
  };
}
