import type { NextFunction, Request, Response } from "express";
import { requireRole } from "./authentication";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Lets any signed-in user read, but only admins change anything.
 *
 * For workspace plumbing (agent runners, integrations, prompt templates) that
 * members need to see in order to run work, but must not reconfigure.
 * Paths under `exemptPathPrefixes` (relative to the router mount) stay open.
 */
export function adminOnlyChanges(options: { exemptPathPrefixes?: string[] } = {}) {
  const requireAdmin = requireRole("admin");
  const exempt = options.exemptPathPrefixes ?? [];

  return (req: Request, res: Response, next: NextFunction) => {
    if (READ_METHODS.has(req.method)) return next();
    if (exempt.some((prefix) => req.path.startsWith(prefix))) return next();
    return requireAdmin(req, res, next);
  };
}
