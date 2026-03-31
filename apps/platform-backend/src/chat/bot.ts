import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createPostgresState } from "@chat-adapter/state-pg";
import { pool } from "../persistence/config/database";

const adapters: Record<string, ReturnType<typeof createSlackAdapter>> = {};
if (process.env.SLACK_SIGNING_SECRET && process.env.SLACK_SIGNING_SECRET !== "not-configured") {
  adapters.slack = createSlackAdapter();
}

const bot = new Chat({
  userName: "viberator",
  adapters,
  state: createPostgresState({ client: pool }),
});

export default bot;
