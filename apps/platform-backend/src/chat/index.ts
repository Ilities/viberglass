/**
 * Chat SDK initialization — imports bot and registers all handlers.
 * Import this module once from app.ts to activate the Slack integration.
 */
import bot from "./bot";
import { chatSessionBridge } from "./ChatSessionBridgeService";
import logger from "../config/logger";

// Side-effect imports register handlers on the bot singleton
import "./handlers/slashCommand";
import "./handlers/modalSubmit";
import "./handlers/threadReply";
import "./handlers/approvalAction";

// Resume bridges for active sessions that were running before restart.
// Deferred so it doesn't block module loading.
setTimeout(() => {
  chatSessionBridge.resumeActiveBridges().catch((err) => {
    logger.error("Failed to resume active Slack bridges", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}, 0);

export default bot;
