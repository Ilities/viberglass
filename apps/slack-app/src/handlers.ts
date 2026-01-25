import { App } from "@slack/bolt";

export function registerSlackHandlers(app: App) {
  app.command("/viberglass", async ({ ack, respond }) => {
    await ack();
    await respond({
      response_type: "ephemeral",
      text:
        "Viberglass Slack app is installed. Configure your project with the bot token to enable notifications.",
    });
  });

  app.event("app_mention", async ({ event, say }) => {
    await say(
      `Hi <@${event.user}>! Use /viberglass if you need install details or setup help.`,
    );
  });

  app.error(async (error) => {
    console.error("Slack app error:", error);
  });
}
