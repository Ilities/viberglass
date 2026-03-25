import { Modal, Select, SelectOption, TextInput } from "chat";
import bot from "../bot";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import logger from "../../config/logger";

const projectDAO = new ProjectDAO();
const clankerDAO = new ClankerDAO();

bot.onSlashCommand("/viberator", async (event) => {
  try {
    const [projects, clankers] = await Promise.all([
      projectDAO.listProjects(),
      clankerDAO.listClankers(),
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
        privateMetadata: JSON.stringify({
          channelId: event.channel.id,
        }),
        children: [
          Select({
            id: "projectId",
            label: "Project",
            placeholder: "Select a project",
            children: projects.map((p) =>
              SelectOption({ label: p.name, value: p.id }),
            ),
          }),
          Select({
            id: "clankerId",
            label: "Clanker",
            placeholder: "Select a clanker",
            children: clankers.map((c) =>
              SelectOption({ label: c.name, value: c.id }),
            ),
          }),
          Select({
            id: "mode",
            label: "Mode",
            children: [
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
    logger.error("Failed to handle /viberator command", {
      error: err instanceof Error ? err.message : String(err),
    });
    await event.channel.post(
      "Something went wrong opening the launch form. Check the logs.",
    );
  }
});
