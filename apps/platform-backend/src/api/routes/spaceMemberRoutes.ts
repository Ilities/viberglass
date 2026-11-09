import type { Request, Router } from "express";
import { isSpaceRole, seesEmails, type SpaceMember } from "@viberglass/types";
import type { SpaceMembershipService } from "../../services/spaces/SpaceMembershipService";
import { validateUuidParam } from "../middleware/validation";

function shown(req: Request, members: SpaceMember[]): SpaceMember[] {
  const role = req.authContext?.user.role;
  return role && seesEmails(role) ? members : members.map((member) => ({ ...member, email: null }));
}

/**
 * Registered on the spaces router, so its `:id` guard applies: anyone who sees
 * the space may list members; changing them needs a maintainer.
 */
export function registerSpaceMemberRoutes(router: Router, membership: Pick<SpaceMembershipService, "list" | "setRole" | "remove">): void {
  router.get("/:id/members", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: shown(req, await membership.list(req.params.id)) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/members/:userId", validateUuidParam("id"), validateUuidParam("userId"), async (req, res, next) => {
    const role: unknown = req.body?.role;
    if (!isSpaceRole(role)) {
      return res.status(400).json({ error: "role must be maintainer or member" });
    }
    try {
      const members = await membership.setRole({
        projectId: req.params.id,
        userId: req.params.userId,
        role,
        actorId: req.authContext!.user.id,
      });
      res.json({ success: true, data: shown(req, members) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/members/:userId", validateUuidParam("id"), validateUuidParam("userId"), async (req, res, next) => {
    try {
      res.json({ success: true, data: shown(req, await membership.remove(req.params.id, req.params.userId)) });
    } catch (error) {
      next(error);
    }
  });
}
