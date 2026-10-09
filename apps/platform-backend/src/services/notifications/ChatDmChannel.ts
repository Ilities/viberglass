import type { NotificationKind } from "@viberglass/types";
import { chatServicesFrom, type ChatService } from "../../chat/chatProviders";
import { ChatIdentityDAO } from "../../persistence/user/ChatIdentityDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import type { NotificationChannel, OutgoingNotification } from "./NotificationChannel";

// Worth a direct message. Step and task updates go to the task's chat thread instead.
const DM_KINDS: ReadonlySet<NotificationKind> = new Set([
  "review_requested",
  "mentioned",
  "task_assigned",
  "run_failed_setup",
  "run_failed_agent",
  "question_asked",
  "question_reminder",
  "credential_expiring",
]);

/** A direct message on each chat service the person linked their account on. */
export class ChatDmChannel implements NotificationChannel {
  readonly name = "chat-dm";

  constructor(
    private readonly services: () => ChatService[] = chatServicesFrom,
    private readonly identities: Pick<ChatIdentityDAO, "getChatUserId"> = new ChatIdentityDAO(),
    private readonly users: Pick<UserDAO, "getContact"> = new UserDAO(),
  ) {}

  async deliver(notification: OutgoingNotification): Promise<void> {
    if (!DM_KINDS.has(notification.kind)) return;
    const configured = this.services().filter((service) => service.provider.isConfigured());
    if (configured.length === 0) return;
    const contact = await this.users.getContact(notification.recipientId);
    if (!contact || contact.deactivated) return;
    const link = notification.link ? { url: notification.link, label: "Open it in Viberglass" } : undefined;
    for (const { provider } of configured) {
      const chatUserId = await this.identities.getChatUserId(notification.recipientId, provider.adapterName);
      if (chatUserId) await provider.sendDirectMessage(chatUserId, notification.text, link);
    }
  }
}
