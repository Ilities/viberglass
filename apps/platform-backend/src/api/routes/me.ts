import express from "express";
import { requireAuth } from "../middleware/authentication";
import { UserDAO } from "../../persistence/user/UserDAO";
import type { EmailSender } from "../../services/notifications/EmailSender";
import { createEmailSender } from "../../services/notifications/createEmailSender";
import { SlackApiError, SlackWebApi } from "../../services/notifications/SlackWebApi";

/** The signed-in person's own notification channels. */
export function createMeRouter(
  users: Pick<UserDAO, "getContact" | "setSlackUserId"> = new UserDAO(),
  slack: Pick<SlackWebApi, "isConfigured" | "lookupUserIdByEmail"> = new SlackWebApi(),
  email: Pick<EmailSender, "isConfigured" | "send"> = createEmailSender(),
) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/notification-channels", async (req, res, next) => {
    try {
      const contact = await users.getContact(req.authContext!.user.id);
      res.json({
        success: true,
        data: {
          slackAvailable: slack.isConfigured(),
          slackLinked: Boolean(contact?.slackUserId),
          emailAvailable: email.isConfigured(),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // Finds the person in Slack by their Viberglass email; they confirm by clicking "Link Slack".
  router.post("/slack-link", async (req, res, next) => {
    if (!slack.isConfigured()) return res.status(409).json({ error: "Slack isn't connected to this workspace yet." });
    try {
      const user = req.authContext!.user;
      const slackUserId = await slack.lookupUserIdByEmail(user.email);
      if (!slackUserId) return res.status(404).json({ error: `No Slack account uses ${user.email}.` });
      await users.setSlackUserId(user.id, slackUserId);
      res.json({ success: true, data: { slackLinked: true } });
    } catch (error) {
      if (error instanceof SlackApiError && error.slackError === "users_not_found") {
        return res.status(404).json({ error: `No Slack account uses ${req.authContext!.user.email}.` });
      }
      if (error instanceof SlackApiError && error.slackError === "missing_scope") {
        return res.status(409).json({
          error: "The Slack app needs the users:read.email and im:write scopes. Reinstall it from Settings → Connections → Slack.",
        });
      }
      next(error);
    }
  });

  // Admins check the email setup by sending themselves one; the transport's own error is shown as is.
  router.post("/test-email", async (req, res) => {
    const user = req.authContext!.user;
    if (user.role !== "admin") return res.status(403).json({ error: "Only admins can send a test email." });
    if (!email.isConfigured()) return res.status(409).json({ error: "Email isn't set up on this workspace." });
    try {
      await email.send({
        to: user.email,
        subject: "Viberglass test email",
        text: "This is a test email from Viberglass. Invite links and notifications will arrive the same way.",
      });
      res.json({ success: true, data: { sentTo: user.email } });
    } catch (error) {
      res.status(502).json({
        error: `The email couldn't be sent: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

  router.delete("/slack-link", async (req, res, next) => {
    try {
      await users.setSlackUserId(req.authContext!.user.id, null);
      res.json({ success: true, data: { slackLinked: false } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createMeRouter();
