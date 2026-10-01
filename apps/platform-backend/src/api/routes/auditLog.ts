import express from "express";
import { isAuditTargetType } from "@viberglass/types";
import { AuditLogDAO } from "../../persistence/audit/AuditLogDAO";

const MAX_PAGE = 200;

/**
 * GET /api/audit-log: the workspace audit log for admins (mounted behind the
 * admin guard), newest first. Filters: `actorId`, `area` and `before` (an
 * entry's `createdAt`, for the next page).
 */
export function createAuditLogRouter(log: Pick<AuditLogDAO, "list"> = new AuditLogDAO()) {
  const router = express.Router();

  router.get("/", async (req, res, next) => {
    const { actorId, area, before, limit } = req.query;
    const beforeDate = typeof before === "string" ? new Date(before) : undefined;
    if (area !== undefined && !isAuditTargetType(area)) return res.status(400).json({ error: "Unknown area" });
    if (beforeDate && Number.isNaN(beforeDate.getTime())) return res.status(400).json({ error: "before must be a date" });
    const pageSize = Math.min(MAX_PAGE, Math.max(1, Number(limit) || 50));
    try {
      const entries = await log.list({
        actorId: typeof actorId === "string" && actorId ? actorId : undefined,
        targetType: area,
        before: beforeDate,
        limit: pageSize,
      });
      res.json({ success: true, data: { entries, hasMore: entries.length === pageSize } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createAuditLogRouter();
