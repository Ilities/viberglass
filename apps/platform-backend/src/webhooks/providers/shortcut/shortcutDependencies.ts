import type { ShortcutPayloadParser } from './ShortcutPayloadParser';

export interface ShortcutWebhookProviderDependencies {
  payloadParser: ShortcutPayloadParser;
}
