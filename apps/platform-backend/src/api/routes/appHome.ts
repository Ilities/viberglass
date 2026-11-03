import express, { type NextFunction, type Request, type Response } from "express";
import type { AppHomeService } from "../../services/apps/AppHomeService";
import { createAppHomeService } from "../../services/apps/createAppSpaceServices";
import { requireAuth } from "../middleware/authentication";
import { validateAppHome } from "../middleware/validation";

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/** The App home, and whether App spaces are offered. Who may change it is decided where it's mounted. */
export function createAppHomeRouter(appHome: Pick<AppHomeService, "status" | "set" | "clear"> = createAppHomeService()) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", asyncRoute(async (_req, res) => {
    res.json({ success: true, data: await appHome.status() });
  }));

  router.put("/", validateAppHome, asyncRoute(async (req, res) => {
    const { integrationId, credentialId, owner } = req.body;
    res.json({ success: true, data: await appHome.set({ integrationId, credentialId, owner }, req.authContext?.user.id ?? null) });
  }));

  router.delete("/", asyncRoute(async (req, res) => {
    res.json({ success: true, data: await appHome.clear(req.authContext?.user.id ?? null) });
  }));

  return router;
}
