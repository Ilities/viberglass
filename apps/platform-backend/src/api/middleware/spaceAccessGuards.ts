import type { NextFunction, Request, RequestParamHandler, Response } from "express";
import { SpaceAccessService, type SpaceViewer } from "../../services/spaces/SpaceAccessService";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function spaceViewerOf(req: Request): SpaceViewer | null {
  const user = req.authContext?.user;
  return user ? { id: user.id, role: user.role } : null;
}

/**
 * `router.param` handler for a space id or slug: reading needs the space to be
 * visible, changing it needs a maintainer. Requests without a signed-in user
 * are left to the route's own authentication.
 */
type Visibility = Pick<SpaceAccessService, "assertCanSee">;

export function spaceParamGuard(
  access: Pick<SpaceAccessService, "assertCanSee" | "assertCanMaintain"> = new SpaceAccessService(),
): RequestParamHandler {
  return (req: Request, _res: Response, next: NextFunction, value: string) => {
    const viewer = spaceViewerOf(req);
    if (!viewer) return next();
    const check = READ_METHODS.has(req.method) ? access.assertCanSee(viewer, value) : access.assertCanMaintain(viewer, value);
    check.then(() => next(), next);
  };
}

type OwnerLookup = (id: string) => Promise<string | null>;

/**
 * `router.param` handler for something that lives in a space (a task, session
 * or run): refuses it when its space isn't visible. Changes within a visible
 * space are left to role checks on the route.
 */
function ownedParamGuard(lookup: OwnerLookup, access: Visibility): RequestParamHandler {
  return (req: Request, _res: Response, next: NextFunction, value: string) => {
    const viewer = spaceViewerOf(req);
    if (!viewer || viewer.role === "admin") return next();
    lookup(value)
      .then((projectId) => (projectId ? access.assertCanSee(viewer, projectId) : undefined))
      .then(() => next(), next);
  };
}

/** For bulk task actions: every task in `req.body.ticketIds` must be in a space the caller sees. */
export function tasksInBodyGuard(
  access: Visibility = new SpaceAccessService(),
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask"> = new SpaceOwnershipDAO(),
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const viewer = spaceViewerOf(req);
    const ids: unknown = req.body?.ticketIds;
    if (!viewer || viewer.role === "admin" || !Array.isArray(ids)) return next();
    Promise.all(
      ids.map(async (id) => {
        const projectId = typeof id === "string" ? await owners.projectIdForTask(id) : null;
        if (projectId) await access.assertCanSee(viewer, projectId);
      }),
    ).then(() => next(), next);
  };
}

export function taskParamGuard(
  access: Visibility = new SpaceAccessService(),
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask"> = new SpaceOwnershipDAO(),
) {
  return ownedParamGuard((id) => owners.projectIdForTask(id), access);
}

export function taskKeyParamGuard(
  access: Visibility = new SpaceAccessService(),
  owners: Pick<SpaceOwnershipDAO, "projectIdForTaskKey"> = new SpaceOwnershipDAO(),
) {
  return ownedParamGuard((key) => owners.projectIdForTaskKey(key), access);
}

export function sessionParamGuard(
  access: Visibility = new SpaceAccessService(),
  owners: Pick<SpaceOwnershipDAO, "projectIdForSession"> = new SpaceOwnershipDAO(),
) {
  return ownedParamGuard((id) => owners.projectIdForSession(id), access);
}

export function jobParamGuard(
  access: Visibility = new SpaceAccessService(),
  owners: Pick<SpaceOwnershipDAO, "projectIdForJob"> = new SpaceOwnershipDAO(),
) {
  return ownedParamGuard((id) => owners.projectIdForJob(id), access);
}
