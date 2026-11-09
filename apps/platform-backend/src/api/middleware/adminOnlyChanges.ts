import type { NextFunction, Request, Response } from "express";
import { requireRole } from "./authentication";
import { requireRunnerRole } from "./workspaceRoleGuards";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Lets admins and members read, but only admins change anything. Guests and
 * viewers don't see it at all.
 *
 * For workspace plumbing (connections, App home) that members need to see in
 * order to create spaces and run work, but must not reconfigure.
 * Paths under `exemptPathPrefixes` (relative to the router mount) are changeable by members too.
 */
export function adminOnlyChanges(options: { exemptPathPrefixes?: string[] } = {}) {
  const requireAdmin = requireRole("admin");
  const exempt = options.exemptPathPrefixes ?? [];

  return (req: Request, res: Response, next: NextFunction) => {
    if (READ_METHODS.has(req.method)) return requireRunnerRole(req, res, next);
    if (exempt.some((prefix) => req.path.startsWith(prefix))) return requireRunnerRole(req, res, next);
    return requireAdmin(req, res, next);
  };
}
