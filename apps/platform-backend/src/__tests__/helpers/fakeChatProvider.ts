import type { ChatProvider } from "@viberglass/integration-core";

/** A chat service whose every call is a jest mock; mentions are written `<@id>`. */
export function fakeChatProvider(options: { configured?: boolean; adapterName?: string } = {}) {
  return {
    adapterName: options.adapterName ?? "slack",
    isConfigured: jest.fn().mockReturnValue(options.configured ?? true),
    createAdapter: jest.fn(),
    registerHandlers: jest.fn(),
    sendDirectMessage: jest.fn().mockResolvedValue(undefined),
    findUserByEmail: jest.fn(),
    mentions: jest.fn((text: string) => [...text.matchAll(/<@([A-Z0-9]+)>/g)].map(([mention, chatUserId]) => ({ text: mention, chatUserId }))),
    withoutBotMention: jest.fn((text: string) => text.replace(/^\s*<@[A-Z0-9]+>\s*/, "")),
  } satisfies ChatProvider;
}
