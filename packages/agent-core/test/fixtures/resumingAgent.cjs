// A scripted ACP agent for AcpClient session tests. Behaviour comes from env:
//   AGENT_SUPPORTS=load,resume   what initialize advertises
//   AGENT_KNOWS=sess_old         the session it can continue (others fail)
//   AGENT_FAIL_FIRST_PROMPT=1    the first prompt on a continued session fails
//   AGENT_ECHO_PROMPT=1          the reply ends with the prompt it got
//   AGENT_COMMANDS=compact       slash commands it announces when a session opens
//   AGENT_USAGE=1200/200000      the usage_update it sends with each reply (used/size)
//   AGENT_ECHO_MCP=1             the reply ends with the MCP servers its session was opened with
// It replays one old message on load, and its reply names the methods it was called with.
const readline = require("readline");

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
const supports = (process.env.AGENT_SUPPORTS ?? "").split(",").filter(Boolean);
const calls = [];
let continued = false;
let failedOnce = false;
let mcpServers = [];

const say = (sessionId, text) =>
  send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });

const announceCommands = (sessionId) => {
  const names = (process.env.AGENT_COMMANDS ?? "").split(",").filter(Boolean);
  if (names.length === 0) return;
  send({
    method: "session/update",
    params: { sessionId, update: { sessionUpdate: "available_commands_update", availableCommands: names.map((name) => ({ name, description: name })) } },
  });
};

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  calls.push(msg.method);
  if (msg.method === "initialize") {
    return send({
      id: msg.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: supports.includes("load"), sessionCapabilities: supports.includes("resume") ? { resume: {} } : {} },
        receivedClientCapabilities: msg.params.clientCapabilities ?? null,
      },
    });
  }
  if (msg.method.startsWith("session/") && Array.isArray(msg.params.mcpServers)) mcpServers = msg.params.mcpServers;
  if (msg.method === "session/new") {
    announceCommands("sess_new");
    return send({ id: msg.id, result: { sessionId: "sess_new" } });
  }
  if (msg.method === "session/load" || msg.method === "session/resume") {
    if (msg.params.sessionId !== process.env.AGENT_KNOWS) return send({ id: msg.id, error: { code: -32002, message: "Resource not found" } });
    if (msg.method === "session/load") say(msg.params.sessionId, "an old reply, replayed");
    continued = true;
    return send({ id: msg.id, result: {} });
  }
  if (msg.method === "session/prompt") {
    if (continued && process.env.AGENT_FAIL_FIRST_PROMPT && !failedOnce) {
      failedOnce = true;
      return send({ id: msg.id, error: { code: -32603, message: "service failure" } });
    }
    const echo = process.env.AGENT_ECHO_PROMPT ? ` | ${msg.params.prompt.map((block) => block.text).join("")}` : "";
    const mcp = process.env.AGENT_ECHO_MCP ? ` | mcp: ${mcpServers.map((server) => `${server.name}=${server.command}`).join(",")}` : "";
    say(msg.params.sessionId, `calls: ${calls.join(" ")}${echo}${mcp}`);
    if (process.env.AGENT_USAGE) {
      const [used, size] = process.env.AGENT_USAGE.split("/").map(Number);
      send({ method: "session/update", params: { sessionId: msg.params.sessionId, update: { sessionUpdate: "usage_update", used, size } } });
    }
    return send({ id: msg.id, result: { stopReason: "end_turn" } });
  }
});
