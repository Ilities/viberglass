import type { NextFunction, Request, Response } from "express";

/**
 * Members make and change task templates, but only admins choose which secrets
 * a template's runs get: binding a secret hands its value to the agent.
 */
export function templateCredentialsGuard(req: Request, res: Response, next: NextFunction): void {
  const role = req.authContext?.user.role;
  const bindings: unknown = req.body?.secretBindings;
  const changesBindings = req.method === "POST" ? Array.isArray(bindings) && bindings.length > 0 : bindings !== undefined;
  if (!role || role === "admin" || !changesBindings) {
    next();
    return;
  }
  res.status(403).json({ error: "Only admins can choose a template's credentials." });
}
