import express, { type Request, type Response } from "express";
import bot from "../../../chat";
import logger from "../../../config/logger";
import type { ExtendedRequest } from "../../../webhooks/middleware/rawBody";

export function createSlackRoutes() {
  const router = express.Router();

  router.post("/", async (req: Request, res: Response) => {
    if (typeof (bot.webhooks as Record<string, unknown>).slack !== "function") {
      logger.warn("Slack webhook received but SLACK_SIGNING_SECRET is not configured");
      res.status(503).json({ error: "Slack integration not configured" });
      return;
    }

    const extReq = req as unknown as ExtendedRequest;
    const rawBody = extReq.rawBody;
    const body: string = rawBody
      ? rawBody.toString("utf-8")
      : JSON.stringify(req.body);
    const protocol = req.protocol;
    const host = req.get("host") ?? "localhost";
    const url = `${protocol}://${host}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val) headers.set(key, Array.isArray(val) ? val.join(", ") : val);
    }
    const webRequest = new Request(url, {
      method: req.method,
      headers,
      body,
    });

    try {
      const webResponse = await bot.webhooks.slack(webRequest);
      res.status(webResponse.status);
      webResponse.headers.forEach((val, key) => res.setHeader(key, val));
      const text = await webResponse.text();
      res.send(text);
    } catch (err: unknown) {
      logger.error("Slack webhook error", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  return router;
}
