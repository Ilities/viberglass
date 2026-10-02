import express from "express";
import { requireAuth } from "../middleware/authentication";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";
import { HomeService } from "../../services/home/HomeService";
import { OverviewService } from "../../services/home/OverviewService";

/** Home (the threads you're in) and Overview (the workspace picture), for the signed-in person. */
export function createHomeRouter(
  home: Pick<HomeService, "load"> = new HomeService(),
  overview: Pick<OverviewService, "load"> = new OverviewService(),
) {
  // Mounted at /api, so authentication is per route rather than for everything after it.
  const router = express.Router();

  router.get("/home", requireAuth, async (req, res, next) => {
    try {
      res.json({ success: true, data: await home.load(spaceViewerOf(req)!) });
    } catch (error) {
      next(error);
    }
  });

  // How many threads need the person, for the sidebar.
  router.get("/home/count", requireAuth, async (req, res, next) => {
    try {
      res.json({ success: true, data: { needsYou: (await home.load(spaceViewerOf(req)!)).needsYou.length } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/overview", requireAuth, async (req, res, next) => {
    const space = typeof req.query.space === "string" && req.query.space ? req.query.space : undefined;
    try {
      res.json({ success: true, data: await overview.load(spaceViewerOf(req)!, space) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createHomeRouter();
