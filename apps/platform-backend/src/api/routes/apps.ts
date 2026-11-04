import express from "express";
import type { AppDirectory } from "../../services/apps/AppDirectory";
import type { AppSignInService } from "../../services/apps/AppSignInService";
import { requireAuth } from "../middleware/authentication";

/** Listing and opening apps; the gateway on the apps domain does the rest. */
export function createAppsRouter(signIn: Pick<AppSignInService, "handoff">, directory: Pick<AppDirectory, "openableBy">) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", async (req, res, next) => {
    try {
      const user = req.authContext!.user;
      res.json({ success: true, data: await directory.openableBy({ id: user.id, role: user.role }) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:slug/handoff", async (req, res, next) => {
    try {
      const context = req.authContext;
      if (!context) return res.status(401).json({ error: "Sign in to open this app" });
      const viewer = { id: context.user.id, role: context.user.role, sessionId: context.session.id };
      res.json({ success: true, data: await signIn.handoff(viewer, req.params.slug, req.body?.returnPath) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
