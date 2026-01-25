import { App, ExpressReceiver } from "@slack/bolt";
import { getReceiverConfig, resolveLogLevel } from "./config";
import { registerSlackHandlers } from "./handlers";

const port = Number.parseInt(process.env.PORT || "4000", 10);
const receiver = new ExpressReceiver(getReceiverConfig());

const app = new App({
  receiver,
  logLevel: resolveLogLevel(process.env.SLACK_LOG_LEVEL),
});

registerSlackHandlers(app);

receiver.app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

receiver.app.get("/", (_req, res) => {
  const baseUrl = process.env.SLACK_APP_BASE_URL;
  const installUrl = baseUrl ? `${baseUrl}/slack/install` : "/slack/install";
  res
    .status(200)
    .send(
      `Viberglass Slack app is running. Install URL: ${installUrl}\n`,
    );
});

(async () => {
  await app.start(port);
  console.log(`Viberglass Slack app listening on port ${port}`);
})();
