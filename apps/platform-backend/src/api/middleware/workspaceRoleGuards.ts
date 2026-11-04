import type { NextFunction, Request, Response } from "express";
import { RUNNER_ROLES, SPACE_MEMBER_ROLES } from "@viberglass/types";
import { requireRole } from "./authentication";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Changes a viewer may still make: to their own session, Inbox and notification settings.
const VIEWER_WRITABLE_PREFIXES = ["/api/auth/logout", "/api/inbox/", "/api/me/"];

/**
 * Viewers are read-only on the server. Mounted once after the auth
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

// What app users may reach: their session and account, invite and reset links, and the apps they open.
const APP_USER_PATHS = ["/api/auth", "/api/me", "/api/account-links", "/api/apps"];

/**
 * App users only open apps, so every other API refuses them. Mounted once
 * after the auth context is attached, so new routes are closed to them by default.
 */
export function confineAppUsers(req: Request, res: Response, next: NextFunction): void {
  const role = req.authContext?.user.role;
  if (!role || SPACE_MEMBER_ROLES.includes(role) || !req.path.startsWith("/api/")) {
    next();
    return;
  }
  if (APP_USER_PATHS.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    next();
    return;
  }
  res.status(403).json({ error: "App users can only open the apps they're given." });
}

const RUNNER_ONLY = "Only admins and members can do this.";

/** Admins and members only: running agents and changing spaces (not guests or viewers). */
export const requireRunnerRole = requireRole([...RUNNER_ROLES], { forbiddenMessage: RUNNER_ONLY });

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
  res.status(403).json({ error: RUNNER_ONLY });
}

/** Anyone signed in may read; only runner roles may change anything. */
export function runnerOnlyChanges() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (READ_METHODS.has(req.method)) return next();
    return requireRunnerRole(req, res, next);
  };
}
