import { Chat, type Adapter } from "chat";
import { createPostgresState } from "@chat-adapter/state-pg";
import { pool } from "../persistence/config/database";
import { chatServicesFrom } from "./chatProviders";

/** The chat services this installation set up, by adapter name. */
const adapters: Record<string, Adapter> = Object.fromEntries(
  chatServicesFrom()
    .filter((service) => service.provider.isConfigured())
    .map((service) => [service.provider.adapterName, service.provider.createAdapter()]),
);

/** The adapters the bot was built with: none when no chat service is set up. */
export const chatAdapterNames: string[] = Object.keys(adapters);

const bot = new Chat({
  userName: "viberglass",
  adapters,
  state: createPostgresState({ client: pool }),
});

export default bot;
