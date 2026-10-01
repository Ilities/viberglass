import express from "express";
import { buildAuthResponse } from "../auth/authResponse";
import { startSession } from "../auth/startSession";
import { validateAcceptInvite, validateResetPassword } from "../middleware/validation";
import { InviteService } from "../../services/people/InviteService";
import { PasswordResetService } from "../../services/people/PasswordResetService";

/**
 * Invite and reset links, opened by people who aren't signed in. The token in
 * the path is the credential; each link works once.
 */
export function createAccountLinksRouter(
  invites: Pick<InviteService, "preview" | "accept"> = new InviteService(),
  resets: Pick<PasswordResetService, "preview" | "reset"> = new PasswordResetService(),
) {
  const router = express.Router();

  router.get("/invites/:token", async (req, res, next) => {
    try {
      const invite = await invites.preview(req.params.token);
      res.json({
        email: invite.email,
        role: invite.role,
        invitedByName: invite.invitedByName,
        expiresAt: invite.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/invites/:token", validateAcceptInvite, async (req, res, next) => {
    try {
      const user = await invites.accept(req.params.token, {
        name: String(req.body.name),
        password: String(req.body.password),
      });
      const token = await startSession(res, user.id);
      res.status(201).json({ token, ...buildAuthResponse(user) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/resets/:token", async (req, res, next) => {
    try {
      const link = await resets.preview(req.params.token);
      res.json({ email: link.email, name: link.name });
    } catch (error) {
      next(error);
    }
  });

  router.post("/resets/:token", validateResetPassword, async (req, res, next) => {
    try {
      const user = await resets.reset(req.params.token, String(req.body.password));
      const token = await startSession(res, user.id);
      res.json({ token, ...buildAuthResponse(user) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createAccountLinksRouter();
