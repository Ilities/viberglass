import { ShortcutConfigResolver } from './ShortcutConfigResolver';
import { ShortcutPayloadParser } from './ShortcutPayloadParser';
import { ShortcutStoryClient } from './ShortcutStoryClient';
import type { ShortcutWebhookProviderDependencies } from './shortcutDependencies';

export function createShortcutWebhookProviderDependencies(): ShortcutWebhookProviderDependencies {
  return {
    configResolver: new ShortcutConfigResolver(),
    payloadParser: new ShortcutPayloadParser(),
    storyClient: new ShortcutStoryClient(),
  };
}
