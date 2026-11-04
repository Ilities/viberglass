import express from "express";
import { validateCreateInvite, validateUuidParam } from "../middleware/validation";
import { InviteService } from "../../services/people/InviteService";
import type { InviteRecord } from "../../persistence/user/InviteDAO";
import { InviteEmails } from "../../services/people/InviteEmails";

function toResponse(invite: InviteRecord) {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    spaceIds: invite.spaceIds,
    appIds: invite.appIds,
    invitedByName: invite.invitedByName,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}

/** Admin-only (mounted behind requireRole("admin")): make, list and revoke invite links. */
export function createInvitesRouter(
  invites: Pick<InviteService, "create" | "listOpen" | "revoke"> = new InviteService(),
  emails: Pick<InviteEmails, "send"> = new InviteEmails(),
) {
  const router = express.Router();

  router.get("/", async (_req, res, next) => {
    try {
      res.json({ invites: (await invites.listOpen()).map(toResponse) });
    } catch (error) {
      next(error);
    }
  });

  // The link is returned only here; only its hash is stored.
  router.post("/", validateCreateInvite, async (req, res, next) => {
    try {
      const { invite, token } = await invites.create({
        email: String(req.body.email),
        role: req.body.role,
        spaceIds: req.body.spaceIds,
        appIds: req.body.appIds,
        createdBy: req.authContext!.user.id,
      });
      const path = `/invite/${token}`;
      const emailed = await emails.send({ to: invite.email, path, inviterName: req.authContext!.user.name });
      res.status(201).json({ invite: toResponse(invite), path, emailed });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", validateUuidParam("id"), async (req, res, next) => {
    try {
      await invites.revoke(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createInvitesRouter();
