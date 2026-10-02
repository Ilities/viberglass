import * as readline from "readline";
import { AskHumanMcpServer } from "./AskHumanMcpServer";
import { QUESTION_RELAY_ENV, postToRelay } from "./questionRelayClient";

// Started by the agent's harness for each session; it reaches the platform only through the worker's relay.
const relayUrl = process.env[QUESTION_RELAY_ENV.url] ?? "";
const secret = process.env[QUESTION_RELAY_ENV.secret] ?? "";

const server = new AskHumanMcpServer(
  (message) => process.stdout.write(`${JSON.stringify(message)}\n`),
  (input) => postToRelay(relayUrl, secret, input),
);

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  void server.handleLine(line);
});
