import type { NotificationKind } from "@viberglass/types";
import { UserDAO } from "../../persistence/user/UserDAO";
import type { NotificationChannel, OutgoingNotification } from "./NotificationChannel";
import { SlackWebApi } from "./SlackWebApi";

// Plan §8: these are worth a DM. Step and task updates go to the task's Slack thread instead.
const DM_KINDS: ReadonlySet<NotificationKind> = new Set([
  "review_requested",
  "mentioned",
  "task_assigned",
  "run_failed_setup",
  "run_failed_agent",
]);

/** A Slack DM, for people who linked their Slack account. */
export class SlackDmChannel implements NotificationChannel {
  readonly name = "slack-dm";

  constructor(
    private readonly slack: Pick<SlackWebApi, "isConfigured" | "postMessage"> = new SlackWebApi(),
    private readonly users: Pick<UserDAO, "getContact"> = new UserDAO(),
  ) {}

  async deliver(notification: OutgoingNotification): Promise<void> {
    if (!DM_KINDS.has(notification.kind) || !this.slack.isConfigured()) return;
    const contact = await this.users.getContact(notification.recipientId);
    if (!contact?.slackUserId || contact.deactivated) return;
    const text = notification.link ? `${notification.text}\n<${notification.link}|Open it in Viberglass>` : notification.text;
    await this.slack.postMessage(contact.slackUserId, text);
  }
}
