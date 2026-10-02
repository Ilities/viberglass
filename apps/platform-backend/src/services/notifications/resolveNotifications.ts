import { type NotificationKind, type TaskActivityKind, type TaskParticipantRole } from "@viberglass/types";

export interface ActivityForNotification {
  kind: TaskActivityKind;
  actorId: string | null;
  payload: Record<string, unknown>;
}

export interface RecipientContext {
  participants: Array<{ userId: string; role: TaskParticipantRole }>;
  adminIds: string[];
}

export interface Recipient {
  userId: string;
  kind: NotificationKind;
}

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);

function withRoles(context: RecipientContext, roles: TaskParticipantRole[]): string[] {
  return context.participants.filter((p) => roles.includes(p.role)).map((p) => p.userId);
}

/**
 * Who hears about a change on a task, and as what. Nobody is told
 * about their own action, and each person gets one item per change.
 */
export function resolveNotifications(activity: ActivityForNotification, context: RecipientContext): Recipient[] {
  const to = (userIds: string[], kind: NotificationKind): Recipient[] => userIds.map((userId) => ({ userId, kind }));
  const recipients = ((): Recipient[] => {
    const userId = typeof activity.payload.userId === "string" ? [activity.payload.userId] : [];
    switch (activity.kind) {
      case "reviewer_added":
        return to(userId, "review_requested");
      case "owner_changed":
        return to(userId, "task_assigned");
      case "message_posted":
        return to(ids(activity.payload.mentioned), "mentioned");
      case "run_finished": {
        // The people the agent mentioned with what it produced are asked to look; the rest hear it's ready.
        const mentioned = ids(activity.payload.mentioned);
        const others = withRoles(context, ["requester", "owner", "watcher"]).filter((id) => !mentioned.includes(id));
        return [...to(mentioned, "mentioned"), ...to(others, "step_completed")];
      }
      case "run_failed": {
        // Setup and platform failures need someone who can fix the workspace; the rest need the task's owner.
        const category = activity.payload.category;
        if (category === "setup" || category === "platform") return to(context.adminIds, "run_failed_setup");
        const owner = withRoles(context, ["owner"]);
        return to(owner.length > 0 ? owner : withRoles(context, ["requester"]), "run_failed_agent");
      }
      case "task_done":
        return to(withRoles(context, ["requester"]), "task_done");
      case "pull_request_merged":
        return to(withRoles(context, ["requester", "owner"]), "task_done");
      case "question_asked":
        return to(userId, "question_asked");
      case "question_reminded":
        return to(userId, "question_reminder");
      default:
        return [];
    }
  })();
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    if (recipient.userId === activity.actorId || seen.has(recipient.userId)) return false;
    seen.add(recipient.userId);
    return true;
  });
}
