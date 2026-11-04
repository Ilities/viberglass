import type { Router } from "express";
import type { AppAccessListService } from "../../services/apps/AppAccessListService";
import type { SpaceAccessService } from "../../services/spaces/SpaceAccessService";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";
import { validateUuidParam } from "../middleware/validation";

/**
 * Registered on the spaces router, whose `:projectId` guard needs a maintainer
 * for changes. Reading the list needs one too: it names people and invited emails.
 */
export function registerAppAccessRoutes(
  router: Router,
  accessList: Pick<AppAccessListService, "list" | "add" | "remove" | "cancelInvite">,
  access: Pick<SpaceAccessService, "assertCanMaintain">,
): void {
  router.get("/:projectId/app/access", validateUuidParam("projectId"), async (req, res, next) => {
    try {
      const viewer = spaceViewerOf(req);
      if (!viewer) return res.status(401).json({ error: "Sign in to see who can open this app" });
      await access.assertCanMaintain(viewer, req.params.projectId);
      res.json({ success: true, data: await accessList.list(req.params.projectId) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/app/access", validateUuidParam("projectId"), async (req, res, next) => {
    const email: unknown = req.body?.email;
    if (typeof email !== "string" || !EMAIL.test(email.trim())) {
      return res.status(400).json({ error: "Enter the email address of the person to add." });
    }
    try {
      const actor = req.authContext!.user;
      const addition = await accessList.add(req.params.projectId, email, { id: actor.id, name: actor.name });
      res.status(addition.kind === "invited" ? 201 : 200).json({ success: true, data: addition });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:projectId/app/access/invites/:inviteId", validateUuidParam("projectId"), validateUuidParam("inviteId"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await accessList.cancelInvite(req.params.projectId, req.params.inviteId) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:projectId/app/access/:userId", validateUuidParam("projectId"), validateUuidParam("userId"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await accessList.remove(req.params.projectId, req.params.userId) });
    } catch (error) {
      next(error);
    }
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+$/;
