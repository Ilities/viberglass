import type { Adapter, Chat } from "chat";
import { createChildLogger } from "../config/logger";
import type { ChatConnections } from "./ChatConnections";
import type { ChatService } from "./chatProviders";

const logger = createChildLogger({ service: "ChatBotRuntime" });

/** What the runtime does with a bot itself; the SDK's `Chat` in the app. */
export interface RuntimeBot {
  registerSingleton(): unknown;
  initialize(): Promise<void>;
}

interface Dependencies<Bot extends RuntimeBot> {
  services: () => ChatService[];
  connections: Pick<ChatConnections, "version" | "credentials">;
  createBot: (adapters: Record<string, Adapter>) => Bot;
  registerHandlers: (bot: Bot, service: ChatService) => void;
  /** After a new bot replaces the old one, e.g. to drop threads bound to its adapters. */
  onRebuilt: () => void;
}

/**
 * The chat bot, built from the chat services whose connections hold what they
 * need. The SDK takes its adapters only when a bot is made, so when a
 * connection changes the services are configured again and a new bot replaces
 * the old one; requests the old one is handling finish on it.
 */
export class ChatBotRuntime<Bot extends RuntimeBot = Chat> {
  private current: Bot;
  private names: string[] = [];
  private version: string | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: Dependencies<Bot>) {
    this.current = deps.createBot({});
    this.current.registerSingleton();
  }

  get bot(): Bot {
    return this.current;
  }

  /** The adapters the bot has: none when no chat service is set up. */
  get adapterNames(): readonly string[] {
    return this.names;
  }

  /**
   * Rebuilds the bot when a chat service's connection changed since the last
   * build. One at a time, so the last change wins; a failure keeps the bot.
   */
  refresh(): Promise<void> {
    this.queue = this.queue.then(() =>
      this.rebuildIfChanged().catch((error: unknown) => {
        logger.error("Couldn't rebuild the chat bot; keeping the one running", {
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
    return this.queue;
  }

  /** Picks up changes made through another backend instance. */
  refreshEvery(intervalMs: number): void {
    setInterval(() => void this.refresh(), intervalMs).unref();
  }

  private async rebuildIfChanged(): Promise<void> {
    const services = this.deps.services();
    const versions = await Promise.all(services.map((service) => this.deps.connections.version(service.system)));
    const version = JSON.stringify(versions);
    if (version === this.version) return;

    for (const service of services) {
      service.provider.configure(await this.deps.connections.credentials(service.system));
    }
    this.install(services.filter((service) => service.provider.isConfigured()));
    this.version = version;
  }

  private install(services: ChatService[]): void {
    const adapters = Object.fromEntries(services.map((service) => [service.provider.adapterName, service.provider.createAdapter()]));
    const bot = this.deps.createBot(adapters);
    for (const service of services) this.deps.registerHandlers(bot, service);
    bot.registerSingleton();
    this.current = bot;
    this.names = Object.keys(adapters);
    this.deps.onRebuilt();
    logger.info("Chat bot built", { adapters: this.names });

    // Connects the state and checks the services' credentials now, not on the first webhook.
    if (this.names.length > 0) {
      bot.initialize().catch((error: unknown) => {
        logger.warn("Chat bot initialization failed; will retry on the first webhook", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
}
