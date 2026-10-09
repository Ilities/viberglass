import { Modal, Select, SelectOption, TextInput } from "chat";
import type { Chat } from "chat";
import type { ChatHandlerServices } from "@viberglass/integration-core";

export function registerSlashCommandHandler(
  bot: Chat,
  services: ChatHandlerServices,
): void {
  bot.onSlashCommand("/viberglass", async (event) => {
    try {
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
              options: projects.map((p) =>
                SelectOption({ label: p.name, value: p.id }),
              ),
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
              placeholder: "A plan or the build",
              options: [
                SelectOption({ label: "A plan", value: "planning" }),
                SelectOption({ label: "The build", value: "execution" }),
              ],
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
