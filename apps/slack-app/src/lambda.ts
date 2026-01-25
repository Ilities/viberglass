import { App, AwsLambdaReceiver } from "@slack/bolt";
import { getReceiverConfig, resolveLogLevel } from "./config";
import { registerSlackHandlers } from "./handlers";

const receiver = new AwsLambdaReceiver(getReceiverConfig());

const app = new App({
  receiver,
  logLevel: resolveLogLevel(process.env.SLACK_LOG_LEVEL),
});

registerSlackHandlers(app);

const handlerPromise: Promise<
  (event: any, context: any, callback: any) => Promise<any>
> = receiver.start();

export const handler = async (
  event: any,
  context: any,
  callback: any,
) => {
  const handler = await handlerPromise;
  return handler(event, context, callback);
};
