import type { AuditAction, AuditTargetType } from "@viberglass/types";
import type { Request, RequestHandler } from "express";
import { AuditRecorder } from "../../services/audit/AuditRecorder";

export interface AuditRule {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** The route's path as the router declares it, e.g. "/:id/credentials". */
  path: string;
  action: AuditAction;
  targetType: AuditTargetType;
  /** The route parameter naming the target; without one, a created thing's id is read from the response. */
  targetParam?: string;
  /** Safe facts from the request. Never return the body itself: it can hold secret values. */
  details?: (req: Request) => Record<string, unknown>;
}

/** Which settings a change touched, by name only. */
export function changedFields(req: Request): Record<string, unknown> {
  return { fields: req.body && typeof req.body === "object" ? Object.keys(req.body).sort() : [] };
}

/** The `id` of what a response returned (`{ data: { id } }` or `{ id }`), and nothing else from it. */
function returnedId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const data = "data" in body && typeof body.data === "object" && body.data !== null ? body.data : body;
  return "id" in data && typeof data.id === "string" ? data.id : null;
}

/**
 * Writes an audit entry for each successful change a router makes, by a
 * table of its routes (J17), so no route in an audited area is missed and no
 * handler has to remember. Mount it in front of the router.
 */
export function auditRequests(rules: AuditRule[], audit: Pick<AuditRecorder, "record"> = new AuditRecorder()): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();

    let createdId: string | null = null;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      createdId = returnedId(body);
      return json(body);
    };

    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      const routePath: unknown = req.route?.path;
      const rule = rules.find((candidate) => candidate.method === req.method && candidate.path === routePath);
      if (!rule) return;
      const targetId = rule.targetParam ? (req.params[rule.targetParam] ?? null) : createdId;
      void audit.record({
        action: rule.action,
        target: { type: rule.targetType, id: targetId },
        details: rule.details?.(req) ?? {},
        actorId: req.authContext?.user.id ?? null,
        ip: req.ip ?? null,
      });
    });
    next();
  };
}
