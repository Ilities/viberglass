import type { NextFunction, Request, Response } from "express";
import { SpaceAccessService } from "../../services/spaces/SpaceAccessService";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { spaceViewerOf } from "./spaceAccessGuards";

type ClawOwners = Pick<SpaceOwnershipDAO, "projectIdForSchedule" | "projectIdForTaskTemplate" | "projectIdForScheduleExecution">;
type OwnerOf = (owners: ClawOwners, id: string) => Promise<string | null>;

// The first path segment names what an id belongs to.
const OWNER_OF_ITEM: Record<string, OwnerOf> = {
  schedules: (owners, id) => owners.projectIdForSchedule(id),
  "task-templates": (owners, id) => owners.projectIdForTaskTemplate(id),
  executions: (owners, id) => owners.projectIdForScheduleExecution(id),
};

function namedProjectId(req: Request): string | undefined {
  const fromQuery = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const fromBody = typeof req.body?.projectId === "string" ? req.body.projectId : undefined;
  return fromQuery ?? fromBody;
}

/**
 * Scheduled runs live in spaces. A route on one schedule, template or
 * execution needs its space visible; anything else from a non-admin must name
 * a visible space, so lists never mix in private spaces.
 */
export function clawSpaceGuard(
  access: Pick<SpaceAccessService, "assertCanSee"> = new SpaceAccessService(),
  owners: ClawOwners = new SpaceOwnershipDAO(),
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const viewer = spaceViewerOf(req);
    if (!viewer || viewer.role === "admin") return next();

    const [kind, id] = req.path.split("/").filter(Boolean);
    const ownerOf = kind && id ? OWNER_OF_ITEM[kind] : undefined;
    if (ownerOf && id) {
      ownerOf(owners, id)
        .then((projectId) => (projectId ? access.assertCanSee(viewer, projectId) : undefined))
        .then(() => next(), next);
      return;
    }

    const projectId = namedProjectId(req);
    if (!projectId) {
      if (!kind) return next();
      res.status(400).json({ error: "Name the space: projectId is required." });
      return;
    }
    access.assertCanSee(viewer, projectId).then(() => next(), next);
  };
}
