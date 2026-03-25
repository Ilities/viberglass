import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createPostgresState } from "@chat-adapter/state-pg";

const bot = new Chat({
  userName: "viberator",
  adapters: {
    slack: createSlackAdapter(),
  },
  state: createPostgresState(),
});

export default bot;
