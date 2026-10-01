import express from "express";
import { validateCreateInvite, validateUuidParam } from "../middleware/validation";
import { InviteService } from "../../services/people/InviteService";
import type { InviteRecord } from "../../persistence/user/InviteDAO";
import type { EmailSender } from "../../services/notifications/EmailSender";
import { createEmailSender } from "../../services/notifications/createEmailSender";
import { createChildLogger } from "../../config/logger";

const logger = createChildLogger({ route: "invites" });

function toResponse(invite: InviteRecord) {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    spaceIds: invite.spaceIds,
    invitedByName: invite.invitedByName,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}

/** Admin-only (mounted behind requireRole("admin")): make, list and revoke invite links. */
export function createInvitesRouter(
  invites: Pick<InviteService, "create" | "listOpen" | "revoke"> = new InviteService(),
  email: Pick<EmailSender, "isConfigured" | "send"> = createEmailSender(),
  frontendUrl: string | undefined = process.env.PLATFORM_FRONTEND_URL,
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
        createdBy: req.authContext!.user.id,
      });
      const path = `/invite/${token}`;
      const emailed = await sendInviteEmail(invite, path, req.authContext!.user.name);
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

  /** Emails the link when SMTP and the platform's address are configured; the admin can always copy it. */
  async function sendInviteEmail(invite: InviteRecord, path: string, inviterName: string): Promise<boolean> {
    const base = frontendUrl?.replace(/\/$/, "");
    if (!email.isConfigured() || !base) return false;
    try {
      await email.send({
        to: invite.email,
        subject: `${inviterName} invited you to Viberglass`,
        text: `${inviterName} invited you to Viberglass. Join here (the link works once, for 7 days):\n\n${base}${path}`,
      });
      return true;
    } catch (error) {
      logger.warn("Failed to email an invite", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  return router;
}

export default createInvitesRouter();
