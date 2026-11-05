import type { NextFunction, Request, Response } from "express";
import { isAppScheduleAction, type ClawSchedule, type ClawScheduleAction } from "@viberglass/types";
import type { ClawScheduleDAO } from "../../../persistence/claw/ClawScheduleDAO";
import type { SpaceAccessService } from "../../../services/spaces/SpaceAccessService";
import { spaceViewerOf } from "../../middleware/spaceAccessGuards";

/** Members run templates on a schedule, but only maintainers decide when the space's app is on. */
export function appScheduleGuard(
  access: Pick<SpaceAccessService, "assertCanMaintain">,
  schedules: Pick<ClawScheduleDAO, "getSchedule">,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const viewer = spaceViewerOf(req);
    if (!viewer) return next();
    appScheduleOf(req, schedules)
      .then((schedule) => (schedule ? access.assertCanMaintain(viewer, schedule.projectId) : undefined))
      .then(() => next(), next);
  };
}

async function appScheduleOf(
  req: Request,
  schedules: Pick<ClawScheduleDAO, "getSchedule">,
): Promise<Pick<ClawSchedule, "projectId"> | null> {
  if (req.params.id) {
    const schedule = await schedules.getSchedule(req.params.id);
    return schedule && isAppScheduleAction(schedule.action) ? schedule : null;
  }
  const action = req.body?.action as ClawScheduleAction | undefined;
  return action && isAppScheduleAction(action) ? { projectId: req.body.projectId } : null;
}
