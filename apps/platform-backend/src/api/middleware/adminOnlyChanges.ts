import type { NextFunction, Request, Response } from "express";
import { PLUMBING_READER_ROLES } from "@viberglass/types";
import { requireRole } from "./authentication";
import { requireRunnerRole } from "./workspaceRoleGuards";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Lets admins, members and viewers read, but only admins change anything.
 * Guests don't see plumbing at all (ADR 0005).
 *
 * For workspace plumbing (agent runners, integrations, prompt templates) that
 * members need to see in order to run work, but must not reconfigure.
 * Paths under `exemptPathPrefixes` (relative to the router mount) are changeable by members too.
 */
export function adminOnlyChanges(options: { exemptPathPrefixes?: string[] } = {}) {
  const requireAdmin = requireRole("admin");
  const requireReader = requireRole([...PLUMBING_READER_ROLES]);
  const exempt = options.exemptPathPrefixes ?? [];

  return (req: Request, res: Response, next: NextFunction) => {
    if (READ_METHODS.has(req.method)) return requireReader(req, res, next);
    if (exempt.some((prefix) => req.path.startsWith(prefix))) return requireRunnerRole(req, res, next);
    return requireAdmin(req, res, next);
  };
}
