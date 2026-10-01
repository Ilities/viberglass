import { notificationText, type TaskActivityKind } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { EmailChannel } from "./EmailChannel";
import { InboxChannel } from "./InboxChannel";
import type { NotificationChannel } from "./NotificationChannel";
import { resolveNotifications } from "./resolveNotifications";
import { SlackDmChannel } from "./SlackDmChannel";

const logger = createChildLogger({ service: "NotificationService" });

export interface RecordedActivity {
  ticketId: string;
  kind: TaskActivityKind;
  actorId: string | null;
  payload: Record<string, unknown>;
}

interface Dependencies {
  participants: Pick<TaskParticipantDAO, "list">;
  users: Pick<UserDAO, "listActiveAdminIds" | "getContact">;
  tasks: Pick<TicketDAO, "getSummary">;
  channels: NotificationChannel[];
  frontendUrl: string | undefined;
}

/**
 * Turns a task's Activity into notifications (plan §8) and sends each through
 * every channel. A channel that fails is logged and the others still deliver.
 */
export class NotificationService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      participants: new TaskParticipantDAO(),
      users: new UserDAO(),
      tasks: new TicketDAO(),
      channels: [new InboxChannel(), new SlackDmChannel(), new EmailChannel()],
      frontendUrl: process.env.PLATFORM_FRONTEND_URL,
      ...deps,
    };
  }

  async onActivity(activity: RecordedActivity): Promise<void> {
    const [participants, adminIds] = await Promise.all([
      this.deps.participants.list(activity.ticketId),
      this.deps.users.listActiveAdminIds(),
    ]);
    const recipients = resolveNotifications(activity, { participants, adminIds });
    if (recipients.length === 0) return;

    const [task, actor] = await Promise.all([
      this.deps.tasks.getSummary(activity.ticketId),
      activity.actorId ? this.deps.users.getContact(activity.actorId) : Promise.resolve(null),
    ]);
    const base = this.deps.frontendUrl?.replace(/\/$/, "");
    const link = base && task ? `${base}/spaces/${task.spaceSlug}/tasks/${task.key}` : null;

    for (const recipient of recipients) {
      const notification = {
        recipientId: recipient.userId,
        kind: recipient.kind,
        ticketId: activity.ticketId,
        actorId: activity.actorId,
        payload: activity.payload,
        text: notificationText(recipient.kind, actor?.name ?? null, task?.title ?? "a task", activity.payload),
        link,
      };
      for (const channel of this.deps.channels) {
        try {
          await channel.deliver(notification);
        } catch (error) {
          logger.warn("Notification channel failed", {
            channel: channel.name,
            kind: recipient.kind,
            ticketId: activity.ticketId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
}
