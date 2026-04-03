import { Modal, Select, SelectOption, TextInput } from "chat";
import type { Chat } from "chat";
import type { SlackHandlerServices } from "../types";

export function registerSlashCommandHandler(
  bot: Chat,
  services: SlackHandlerServices,
): void {
  bot.onSlashCommand("/viberator", async (event) => {
    try {
      const [projects, clankers] = await Promise.all([
        services.listProjects(),
        services.listClankers(),
      ]);

      if (projects.length === 0) {
        await event.channel.post(
          "No projects configured. Create a project in Viberator first.",
        );
        return;
      }

      if (clankers.length === 0) {
        await event.channel.post(
          "No clankers configured. Create a clanker in Viberator first.",
        );
        return;
      }

      const result = await event.openModal(
        Modal({
          callbackId: "viberator_launch",
          title: "Launch Agent Session",
          submitLabel: "Launch",
          privateMetadata: JSON.stringify({ channelId: event.channel.id }),
          children: [
            Select({
              id: "projectId",
              label: "Project",
              placeholder: "Select a project",
              options: projects.map((p) =>
                SelectOption({ label: p.name, value: p.id }),
              ),
            }),
            Select({
              id: "clankerId",
              label: "Clanker",
              placeholder: "Select a clanker",
              options: clankers.map((c) =>
                SelectOption({ label: c.name, value: c.id }),
              ),
            }),
            Select({
              id: "mode",
              label: "Mode",
              placeholder: "Select a mode",
              options: [
                SelectOption({ label: "Research", value: "research" }),
                SelectOption({ label: "Planning", value: "planning" }),
                SelectOption({ label: "Execution", value: "execution" }),
              ],
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
