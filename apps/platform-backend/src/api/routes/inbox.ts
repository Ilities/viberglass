import express from "express";
import { myTaskGroup, type MyTask } from "@viberglass/types";
import { requireAuth } from "../middleware/authentication";
import { validateUuidParam } from "../middleware/validation";
import { NotificationDAO } from "../../persistence/notification/NotificationDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { SpaceAccessService } from "../../services/spaces/SpaceAccessService";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";

const MAX_SNOOZE_HOURS = 24 * 14;

/** The signed-in person's Inbox and My tasks. Everything here is theirs alone. */
export function createInboxRouter(
  notifications: Pick<NotificationDAO, "list" | "countUnread" | "update"> = new NotificationDAO(),
  participants: Pick<TaskParticipantDAO, "listTasksFor"> = new TaskParticipantDAO(),
  access: Pick<SpaceAccessService, "visibleProjectIds"> = new SpaceAccessService(),
) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", async (req, res, next) => {
    try {
      const userId = req.authContext!.user.id;
      const state = req.query.state === "done" ? "done" : "open";
      const [items, unread] = await Promise.all([notifications.list(userId, state), notifications.countUnread(userId)]);
      res.json({ success: true, data: { items, unread } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/count", async (req, res, next) => {
    try {
      res.json({ success: true, data: { unread: await notifications.countUnread(req.authContext!.user.id) } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/my-tasks", async (req, res, next) => {
    try {
      const visible = await access.visibleProjectIds(spaceViewerOf(req)!);
      const rows = await participants.listTasksFor(req.authContext!.user.id, visible);
      const tasks: MyTask[] = rows.map((row) => ({
        id: row.id,
        key: row.key,
        title: row.title,
        spaceSlug: row.spaceSlug,
        roles: row.roles,
        updatedAt: row.updatedAt,
        group: myTaskGroup(row.status, row.roles),
      }));
      res.json({ success: true, data: tasks });
    } catch (error) {
      next(error);
    }
  });

  // Body: { read?: boolean, done?: boolean, snoozeHours?: number }; snoozeHours 0 un-snoozes.
  router.post("/:id", validateUuidParam("id"), async (req, res, next) => {
    const { read, done, snoozeHours } = req.body ?? {};
    if (read !== undefined && typeof read !== "boolean") return res.status(400).json({ error: "read must be true or false" });
    if (done !== undefined && typeof done !== "boolean") return res.status(400).json({ error: "done must be true or false" });
    if (snoozeHours !== undefined && (typeof snoozeHours !== "number" || snoozeHours < 0 || snoozeHours > MAX_SNOOZE_HOURS)) {
      return res.status(400).json({ error: "snoozeHours must be between 0 and 336" });
    }
    try {
      const changed = await notifications.update(req.authContext!.user.id, req.params.id, {
        read,
        done,
        ...(snoozeHours !== undefined && {
          snoozedUntil: snoozeHours === 0 ? null : new Date(Date.now() + snoozeHours * 3_600_000),
        }),
      });
      if (!changed) return res.status(404).json({ error: "Not in your Inbox" });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createInboxRouter();
