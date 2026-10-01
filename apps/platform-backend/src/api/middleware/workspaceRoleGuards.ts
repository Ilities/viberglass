import type { NextFunction, Request, Response } from "express";
import { RUNNER_ROLES } from "@viberglass/types";
import { requireRole } from "./authentication";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Changes a viewer may still make: to their own session, Inbox and notification settings.
const VIEWER_WRITABLE_PREFIXES = ["/api/auth/logout", "/api/inbox/", "/api/me/"];

/**
 * Viewers are read-only on the server (ADR 0005). Mounted once after the auth
 * context is attached, so every mutating route refuses them by default.
 * Requests without a signed-in user (worker callbacks, webhooks) pass through.
 */
export function refuseViewerChanges(req: Request, res: Response, next: NextFunction): void {
  const role = req.authContext?.user.role;
  if (role !== "viewer" || READ_METHODS.has(req.method) || VIEWER_WRITABLE_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    next();
    return;
  }
  res.status(403).json({ error: "Viewers can see everything but can't make changes." });
}

/** Admins and members only: running agents and changing spaces (not guests or viewers). */
export const requireRunnerRole = requireRole([...RUNNER_ROLES]);

/**
 * For routes authenticated some other way (API tokens): the role check
 * `requireRole` can't do, since it authenticates with a session.
 */
export function refuseNonRunnerRoles(req: Request, res: Response, next: NextFunction): void {
  const role = req.authContext?.user.role;
  if (role && RUNNER_ROLES.includes(role)) {
    next();
    return;
  }
  res.status(403).json({ error: "Only admins and members can do this." });
}

/** Anyone signed in may read; only runner roles may change anything. */
export function runnerOnlyChanges() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (READ_METHODS.has(req.method)) return next();
    return requireRunnerRole(req, res, next);
  };
}
