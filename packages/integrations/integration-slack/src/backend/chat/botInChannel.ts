import { SlackApiError, type SlackWebApi } from "../SlackWebApi";

export const INVITE_BOT_MESSAGE =
  "Invite me to this channel first with `/invite @Viberglass`, so I can follow the replies to your task here.";

/** Slack errors that mean the bot can't see or join the channel, rather than a failed request. */
const CANT_JOIN = new Set(["channel_not_found", "missing_scope", "method_not_supported_for_channel_type", "is_archived"]);

/**
 * Makes sure the bot is in the channel a task is started from: Slack only
 * sends it replies and mentions from channels it's in. It joins public
 * channels itself; for a private channel, or an app installed without
 * `channels:join`, it answers with what the person should do instead.
 */
export async function botInChannel(
  api: Pick<SlackWebApi, "channelMembership" | "joinChannel">,
  channel: string,
): Promise<string | null> {
  try {
    const membership = await api.channelMembership(channel);
    if (membership.isMember) return null;
    if (membership.isPrivate) return INVITE_BOT_MESSAGE;
    await api.joinChannel(channel);
    return null;
  } catch (error) {
    if (error instanceof SlackApiError && CANT_JOIN.has(error.slackError)) return INVITE_BOT_MESSAGE;
    throw error;
  }
}
