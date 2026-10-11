import express from "express";
import { ChatAccountError } from "@viberglass/integration-core";
import type { NotificationChannels } from "@viberglass/types";
import { requireAuth } from "../middleware/authentication";
import { chatServicesFrom, type ChatService } from "../../chat/chatProviders";
import { ChatIdentityDAO } from "../../persistence/user/ChatIdentityDAO";
import type { EmailSender } from "../../services/notifications/EmailSender";
import { createEmailSender } from "../../services/notifications/createEmailSender";

/** The signed-in person's own notification channels. */
export function createMeRouter(
  identities: Pick<ChatIdentityDAO, "getChatUserId" | "setChatUserId"> = new ChatIdentityDAO(),
  chatServices: () => ChatService[] = chatServicesFrom,
  email: Pick<EmailSender, "isConfigured" | "send"> = createEmailSender(),
) {
  const router = express.Router();
  router.use(requireAuth);

  const serviceOf = (system: string) => chatServices().find((service) => service.system === system);

  router.get("/notification-channels", async (req, res, next) => {
    try {
      const userId = req.authContext!.user.id;
      const chat = await Promise.all(
        chatServices().map(async ({ system, label, provider }) => ({
          system,
          label,
          available: provider.isConfigured(),
          linked: (await identities.getChatUserId(userId, provider.adapterName)) !== null,
        })),
      );
      const data: NotificationChannels = { chat, emailAvailable: email.isConfigured() };
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  });

  // Finds the person on the chat service by their Viberglass email; they confirm by clicking "Link".
  router.post("/chat-links/:system", async (req, res, next) => {
    const service = serviceOf(req.params.system);
    if (!service?.provider.isConfigured()) {
      return res.status(409).json({ error: `${service?.label ?? "That chat service"} isn't connected to this workspace yet.` });
    }
    try {
      const user = req.authContext!.user;
      const chatUserId = await service.provider.findUserByEmail(user.email);
      await identities.setChatUserId(user.id, service.provider.adapterName, chatUserId);
      res.json({ success: true, data: { linked: true } });
    } catch (error) {
      if (error instanceof ChatAccountError) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  });

  router.delete("/chat-links/:system", async (req, res, next) => {
    const service = serviceOf(req.params.system);
    if (!service) return res.status(404).json({ error: "No such chat service." });
    try {
      await identities.setChatUserId(req.authContext!.user.id, service.provider.adapterName, null);
      res.json({ success: true, data: { linked: false } });
    } catch (error) {
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

  return router;
}

export default createMeRouter();
