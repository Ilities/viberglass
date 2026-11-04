import express from "express";
import type { AppSignInService } from "../../services/apps/AppSignInService";
import { requireAuth } from "../middleware/authentication";

/** Opening apps; the gateway on the apps domain does the rest. */
export function createAppsRouter(signIn: Pick<AppSignInService, "handoff">) {
  const router = express.Router();
  router.use(requireAuth);

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
