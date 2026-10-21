import { Modal, Select, SelectOption, TextInput } from "chat";
import type { Chat } from "chat";
import type { ChatHandlerServices, ChatSpaceSummary } from "@viberglass/integration-core";

/**
 * The form's "Start with" choices. Slack can't change them when another
 * space is picked, so with Files and Git spaces both listed the build choice
 * names both, and the Files spaces are marked.
 */
export function launchChoices(spaces: ChatSpaceSummary[]) {
  const files = spaces.filter((space) => space.backingKind === "files").length;
  const mixed = files > 0 && files < spaces.length;
  const plan = SelectOption({ label: "A plan", value: "planning" });
  const spaceOptions = spaces.map((space) =>
    SelectOption({ label: mixed && space.backingKind === "files" ? `${space.name} (Files)` : space.name, value: space.id }),
  );
  if (files === spaces.length) {
    return { spaces: spaceOptions, start: [SelectOption({ label: "The artifact", value: "execution" }), plan], placeholder: "The artifact or a plan" };
  }
  const work = SelectOption({ label: mixed ? "The build, or the artifact in a Files space" : "The build", value: "execution" });
  return { spaces: spaceOptions, start: [plan, work], placeholder: mixed ? "A plan or the work" : "A plan or the build" };
}

export function registerSlashCommandHandler(
  bot: Pick<Chat, "onSlashCommand">,
  services: ChatHandlerServices,
  /** Null once the bot is in the channel; otherwise what to tell the person. */
  botInChannel: (channel: string) => Promise<string | null>,
): void {
  bot.onSlashCommand("/viberglass", async (event) => {
    try {
      // Only a linked account can be the task's requester; nothing is started without one.
      const unlinked = await services.unlinkedAccountMessage(event.user.userId);
      if (unlinked) {
        await event.channel.postEphemeral(event.user, unlinked, { fallbackToDM: true });
        return;
      }

      // The chat SDK names channels "slack:<id>".
      const notInChannel = await botInChannel(event.channel.id.replace(/^slack:/, ""));
      if (notInChannel) {
        await event.channel.postEphemeral(event.user, notInChannel, { fallbackToDM: true });
        return;
      }

      const [projects, clankers] = await Promise.all([
        services.listProjects(event.user.userId),
        services.listClankers(),
      ]);

      if (projects.length === 0) {
        await event.channel.post(
          "No spaces yet. Create a space in Viberglass first.",
        );
        return;
      }

      if (clankers.length === 0) {
        await event.channel.post(
          "No agents yet. Add an agent in Viberglass first.",
        );
        return;
      }

      const choices = launchChoices(projects);
      const result = await event.openModal(
        Modal({
          callbackId: "viberglass_launch",
          title: "Ask the agent",
          submitLabel: "Ask",
          privateMetadata: JSON.stringify({ channelId: event.channel.id }),
          children: [
            Select({
              id: "projectId",
              label: "Space",
              placeholder: "Select a space",
              options: choices.spaces,
            }),
            Select({
              id: "clankerId",
              label: "Agent",
              placeholder: "Select an agent",
              options: clankers.map((c) =>
                SelectOption({ label: c.name, value: c.id }),
              ),
            }),
            Select({
              id: "mode",
              label: "Start with",
              placeholder: choices.placeholder,
              options: choices.start,
            }),
            TextInput({
              id: "title",
              label: "Title",
              placeholder: "Short summary of the task",
            }),
            TextInput({
              id: "message",
              label: "Message",
              placeholder: "Describe what you want the agent to do",
              multiline: true,
            }),
          ],
        }),
      );

      if (!result) {
        await event.channel.post(
          "Could not open the launch form. Please try again.",
        );
      }
    } catch (err) {
      await event.channel.post(
        "Something went wrong opening the launch form. Check the logs.",
      );
    }
  });
}
