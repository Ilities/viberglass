import { NotificationDAO } from "../../persistence/notification/NotificationDAO";
import type { NotificationChannel, OutgoingNotification } from "./NotificationChannel";

/** Everything lands in the Inbox. */
export class InboxChannel implements NotificationChannel {
  readonly name = "inbox";

  constructor(private readonly notifications: Pick<NotificationDAO, "create"> = new NotificationDAO()) {}

  async deliver(notification: OutgoingNotification): Promise<void> {
    await this.notifications.create({
      recipientId: notification.recipientId,
      kind: notification.kind,
      ticketId: notification.ticketId,
      actorId: notification.actorId,
      payload: notification.payload,
    });
  }
}
