import type { NotificationKind } from "@viberglass/types";
import { UserDAO } from "../../persistence/user/UserDAO";
import type { NotificationChannel, OutgoingNotification } from "./NotificationChannel";
import type { EmailSender } from "./EmailSender";
import { createEmailSender } from "./createEmailSender";

// Email for setup failures, finished tasks and the agent's questions, which wait on one person.
// Mentions and reviews would be a digest, which is off.
const EMAIL_KINDS: ReadonlySet<NotificationKind> = new Set([
  "run_failed_setup",
  "task_done",
  "question_asked",
  "question_reminder",
  "credential_expiring",
]);

/** Email, when a transport is configured (SES on AWS, SMTP when self-hosted). */
export class EmailChannel implements NotificationChannel {
  readonly name = "email";

  constructor(
    private readonly email: Pick<EmailSender, "isConfigured" | "send"> = createEmailSender(),
    private readonly users: Pick<UserDAO, "getContact"> = new UserDAO(),
  ) {}

  async deliver(notification: OutgoingNotification): Promise<void> {
    if (!EMAIL_KINDS.has(notification.kind) || !this.email.isConfigured()) return;
    const contact = await this.users.getContact(notification.recipientId);
    if (!contact || contact.deactivated) return;
    await this.email.send({
      to: contact.email,
      subject: notification.text,
      text: notification.link ? `${notification.text}\n\n${notification.link}` : notification.text,
    });
  }
}
