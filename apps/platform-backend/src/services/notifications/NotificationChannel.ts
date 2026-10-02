import type { NotificationKind } from "@viberglass/types";

/** One notification on its way to one person. */
export interface OutgoingNotification {
  recipientId: string;
  kind: NotificationKind;
  ticketId: string | null;
  actorId: string | null;
  payload: Record<string, unknown>;
  /** One sentence, the same in Slack and email. */
  text: string;
  /** Where the person acts on it, when the platform's address is known. */
  link: string | null;
}

/** A way to reach someone outside the app: a Slack DM, email. Each decides what it carries. */
export interface NotificationChannel {
  readonly name: string;
  deliver(notification: OutgoingNotification): Promise<void>;
}
