// A scripted ACP agent that opens a session and never answers its prompt. Behaviour comes from env:
//   AGENT_IGNORE_TERM=1   it ignores SIGTERM, and only goes when its input closes
//   AGENT_EXIT_ON_PROMPT=1  it exits mid-turn instead of hanging
const readline = require("readline");

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");

if (process.env.AGENT_IGNORE_TERM) process.on("SIGTERM", () => {});
const keepAlive = setInterval(() => {}, 1000);

const input = readline.createInterface({ input: process.stdin });
input.on("close", () => {
  clearInterval(keepAlive);
  process.exit(0);
});
input.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") send({ id: msg.id, result: { protocolVersion: 1, agentCapabilities: {} } });
  else if (msg.method === "session/new") send({ id: msg.id, result: { sessionId: "sess_new" } });
  else if (msg.method === "session/prompt" && process.env.AGENT_EXIT_ON_PROMPT) process.exit(3);
});
