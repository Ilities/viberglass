import express from "express";
import { requireAuth } from "../middleware/authentication";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";
import { HomeService } from "../../services/home/HomeService";
import { OverviewService } from "../../services/home/OverviewService";
import { TaskAttentionDAO } from "../../persistence/ticketing/TaskAttentionDAO";
import { TaskMentionDAO } from "../../persistence/ticketing/TaskMentionDAO";

/** Home (the threads you're in) and Overview (the workspace picture), for the signed-in person. */
export function createHomeRouter(
  home: Pick<HomeService, "load"> = new HomeService(),
  overview: Pick<OverviewService, "load"> = new OverviewService(),
  attention: Pick<TaskAttentionDAO, "set" | "clear"> = new TaskAttentionDAO(),
  mentions: Pick<TaskMentionDAO, "markOneDone"> = new TaskMentionDAO(),
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
      const data = await home.load(spaceViewerOf(req)!);
      res.json({ success: true, data: { needsYou: data.newCount ?? data.needsYou.length } });
    } catch (error) {
      next(error);
    }
  });

  router.put("/home/attention/:ticketId", requireAuth, async (req, res, next) => {
    try {
      const viewer = spaceViewerOf(req)!;
      const data = await home.load(viewer);
      const requests = [...data.needsYou, ...(data.waiting ?? []), ...(data.later ?? [])].filter((entry) => entry.task.id === req.params.ticketId);
      if (!requests.length) return res.status(404).json({ success: false, error: "Request not found" });
      const thread = requests.find((entry) => entry.attention?.source === req.body?.source);
      if (!thread?.attention) return res.status(409).json({ success: false, error: "This request has changed. Refresh and try again." });
      const mode: unknown = req.body?.mode;
      if (mode === "handled" && thread.attention.kind === "mention" && thread.attention.source.startsWith("mention:")) {
        await mentions.markOneDone(thread.task.id, viewer.id, thread.attention.source.slice("mention:".length));
      } else if (mode === "clear") {
        await attention.clear(viewer.id, thread.task.id, thread.attention.source);
      } else {
        if (mode !== "acknowledged" && mode !== "waiting" && mode !== "later") return res.status(400).json({ success: false, error: "Choose how to handle this request." });
        const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
        if (reason.length > 500 || (mode === "waiting" && !reason)) return res.status(400).json({ success: false, error: "Add a waiting reason of at most 500 characters." });
        const rawDate: unknown = req.body?.remindAt;
        const remindAt = typeof rawDate === "string" ? new Date(rawDate) : null;
        if ((rawDate && (!remindAt || !Number.isFinite(remindAt.getTime()) || remindAt <= new Date())) || (mode === "later" && !remindAt)) return res.status(400).json({ success: false, error: "Choose a future reminder time." });
        await attention.set(viewer.id, thread.task.id, thread.attention.source, mode, reason || null, remindAt, thread.attention.questionIds);
      }
      return res.json({ success: true });
    } catch (error) { return next(error); }
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
