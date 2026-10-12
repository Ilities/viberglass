import express, { type NextFunction, type Request, type Response } from "express";
import { chatBot } from "../../../chat";
import { chatServicesFrom } from "../../../chat/chatProviders";
import logger from "../../../config/logger";
import type { ExtendedRequest } from "../../../webhooks/ExtendedRequest";

/** POST /api/webhooks/:adapter — a chat service's events, handed to the chat SDK's adapter for it. */
export function createChatRoutes(chatServices = chatServicesFrom) {
  const router = express.Router();

  router.post("/:adapter", async (req: Request, res: Response, next: NextFunction) => {
    const { adapter } = req.params;
    if (!chatServices().some((service) => service.provider.adapterName === adapter)) {
      next();
      return;
    }
    // Another backend instance may have saved the connection.
    await chatBot.refresh();
    if (!chatBot.adapterNames.includes(adapter)) {
      logger.warn("Chat webhook received for a service that isn't set up", { adapter });
      res.status(503).json({ error: `${adapter} isn't set up on this installation` });
      return;
    }

    const rawBody = (req as ExtendedRequest).rawBody;
    const body: string = rawBody ? rawBody.toString("utf-8") : JSON.stringify(req.body);
    const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val) headers.set(key, Array.isArray(val) ? val.join(", ") : val);
    }

    try {
      const webResponse = await chatBot.bot.webhooks[adapter](new Request(url, { method: req.method, headers, body }));
      res.status(webResponse.status);
      webResponse.headers.forEach((val, key) => res.setHeader(key, val));
      res.send(await webResponse.text());
    } catch (err: unknown) {
      logger.error("Chat webhook error", { adapter, error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
