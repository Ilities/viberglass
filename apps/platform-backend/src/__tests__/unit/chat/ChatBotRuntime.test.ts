import type { AuthCredentials } from "@viberglass/types";
import { ChatBotRuntime } from "../../../chat/ChatBotRuntime";
import type { ChatService } from "../../../chat/chatProviders";
import { fakeChatProvider } from "../../helpers/fakeChatProvider";

interface FakeBot {
  adapters: Record<string, unknown>;
  registerSingleton: jest.Mock;
  initialize: jest.Mock;
}

/** A chat service set up whenever its connection holds a token. */
function chatService(system: string): ChatService {
  const provider = fakeChatProvider({ adapterName: system });
  let configured = false;
  provider.configure.mockImplementation((connection: AuthCredentials | null) => {
    configured = typeof connection?.token === "string";
  });
  provider.isConfigured.mockImplementation(() => configured);
  provider.createAdapter.mockImplementation(() => ({ name: system }));
  return { system, label: system, provider };
}

function setup(services: ChatService[]) {
  const connections = new Map<string, { version: string; credentials: AuthCredentials }>();
  const deps = {
    services: () => services,
    connections: {
      version: jest.fn(async (system: string) => connections.get(system)?.version ?? null),
      credentials: jest.fn(async (system: string) => connections.get(system)?.credentials ?? null),
    },
    createBot: jest.fn((adapters: Record<string, unknown>): FakeBot => ({
      adapters,
      registerSingleton: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
    })),
    registerHandlers: jest.fn(),
    onRebuilt: jest.fn(),
  };
  const runtime = new ChatBotRuntime<FakeBot>(deps);
  const connect = (system: string, version: string, token?: string) =>
    connections.set(system, { version, credentials: { type: "token", ...(token ? { token } : {}) } });
  const disconnect = (system: string) => connections.delete(system);
  return { runtime, deps, connect, disconnect };
}

describe("ChatBotRuntime", () => {
  it("starts with a bot without adapters", () => {
    const { runtime } = setup([chatService("chat-a")]);
    expect(runtime.adapterNames).toEqual([]);
    expect(runtime.bot.registerSingleton).toHaveBeenCalled();
  });

  it("builds the bot with the services whose connections hold what they need, and their handlers", async () => {
    const a = chatService("chat-a");
    const b = chatService("chat-b");
    const { runtime, deps, connect } = setup([a, b]);
    connect("chat-a", "v1", "token-a");
    connect("chat-b", "v1");

    await runtime.refresh();

    expect(a.provider.configure).toHaveBeenLastCalledWith({ type: "token", token: "token-a" });
    expect(runtime.adapterNames).toEqual(["chat-a"]);
    expect(runtime.bot.adapters).toEqual({ "chat-a": { name: "chat-a" } });
    expect(deps.registerHandlers).toHaveBeenCalledTimes(1);
    expect(deps.registerHandlers).toHaveBeenCalledWith(runtime.bot, a);
    expect(runtime.bot.registerSingleton).toHaveBeenCalled();
    expect(runtime.bot.initialize).toHaveBeenCalled();
    expect(deps.onRebuilt).toHaveBeenCalled();
  });

  it("rebuilds only when a connection changed", async () => {
    const { runtime, deps, connect } = setup([chatService("chat-a")]);
    connect("chat-a", "v1", "token-a");
    await runtime.refresh();
    const first = runtime.bot;

    await runtime.refresh();
    expect(runtime.bot).toBe(first);

    connect("chat-a", "v2", "token-b");
    await runtime.refresh();
    expect(runtime.bot).not.toBe(first);
    expect(deps.createBot).toHaveBeenCalledTimes(3);
  });

  it("tears the service down when its connection is removed", async () => {
    const a = chatService("chat-a");
    const { runtime, connect, disconnect } = setup([a]);
    connect("chat-a", "v1", "token-a");
    await runtime.refresh();

    disconnect("chat-a");
    await runtime.refresh();

    expect(a.provider.configure).toHaveBeenLastCalledWith(null);
    expect(a.provider.isConfigured()).toBe(false);
    expect(runtime.adapterNames).toEqual([]);
    expect(runtime.bot.adapters).toEqual({});
  });

  it("keeps the running bot when reading the connections fails, and tries again next time", async () => {
    const { runtime, deps, connect } = setup([chatService("chat-a")]);
    connect("chat-a", "v1", "token-a");
    await runtime.refresh();
    const running = runtime.bot;

    deps.connections.credentials.mockRejectedValueOnce(new Error("database down"));
    connect("chat-a", "v2", "token-b");
    await runtime.refresh();
    expect(runtime.bot).toBe(running);

    await runtime.refresh();
    expect(runtime.bot).not.toBe(running);
  });
});
