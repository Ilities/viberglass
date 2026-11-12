import express from "express";
import type { PinTarget } from "@viberglass/types";
import { requireAuth } from "../middleware/authentication";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";
import { PinsService, PinTargetNotFound } from "../../services/pins/PinsService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PINS_REORDERED = 500;

/** A pin target from a request body, or null when it isn't one. */
export function pinTargetOf(body: unknown): PinTarget | null {
  if (typeof body !== "object" || body === null || !("target" in body)) return null;
  const target: unknown = body.target;
  if (typeof target !== "object" || target === null || !("kind" in target)) return null;
  if (target.kind === "artifact" && "artifactId" in target && typeof target.artifactId === "string" && UUID.test(target.artifactId)) {
    return { kind: "artifact", artifactId: target.artifactId };
  }
  if (target.kind === "app" && "spaceId" in target && typeof target.spaceId === "string" && UUID.test(target.spaceId)) {
    return { kind: "app", spaceId: target.spaceId };
  }
  return null;
}

/** The signed-in person's pins on Home. */
export function createPinsRouter(pins: Pick<PinsService, "list" | "pin" | "unpin" | "reorder" | "opened"> = new PinsService()) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", async (req, res, next) => {
    try {
      res.json({ success: true, data: await pins.list(spaceViewerOf(req)!) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    const target = pinTargetOf(req.body);
    if (!target) return res.status(400).json({ success: false, error: "Choose an artifact or an app to pin." });
    try {
      return res.json({ success: true, data: await pins.pin(spaceViewerOf(req)!, target) });
    } catch (error) {
      if (error instanceof PinTargetNotFound) return res.status(404).json({ success: false, error: "There's nothing to pin there." });
      return next(error);
    }
  });

  router.put("/order", async (req, res, next) => {
    const ids: unknown = req.body?.pinIds;
    if (!Array.isArray(ids) || ids.length > MAX_PINS_REORDERED || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
      return res.status(400).json({ success: false, error: "Send the pins in their new order." });
    }
    try {
      return res.json({ success: true, data: await pins.reorder(spaceViewerOf(req)!, ids) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/opened", async (req, res, next) => {
    const target = pinTargetOf(req.body);
    if (!target) return res.status(400).json({ success: false, error: "Choose an artifact or an app." });
    try {
      await pins.opened(spaceViewerOf(req)!, target);
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:pinId", async (req, res, next) => {
    if (!UUID.test(req.params.pinId)) return res.status(404).json({ success: false, error: "Pin not found" });
    try {
      return res.json({ success: true, data: await pins.unpin(spaceViewerOf(req)!, req.params.pinId) });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export default createPinsRouter();
