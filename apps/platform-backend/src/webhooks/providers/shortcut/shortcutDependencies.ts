import type { ShortcutConfigResolver } from './ShortcutConfigResolver';
import type { ShortcutPayloadParser } from './ShortcutPayloadParser';
import type { ShortcutStoryClient } from './ShortcutStoryClient';

export interface ShortcutWebhookProviderDependencies {
  configResolver: ShortcutConfigResolver;
  payloadParser: ShortcutPayloadParser;
  storyClient: ShortcutStoryClient;
}
