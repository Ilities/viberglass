import bot from "../bot";
import logger from "../../config/logger";

bot.onNewMention(async (thread, message) => {
  logger.info("onNewMention fired (unsubscribed thread)", {
    threadId: thread.id,
    isMention: message.isMention,
    text: message.text?.slice(0, 200),
  });
});
