// A scripted ACP agent for AcpClient session tests. Behaviour comes from env:
//   AGENT_SUPPORTS=load,resume   what initialize advertises
//   AGENT_KNOWS=sess_old         the session it can continue (others fail)
//   AGENT_FAIL_FIRST_PROMPT=1    the first prompt on a continued session fails
//   AGENT_ECHO_PROMPT=1          the reply ends with the prompt it got
//   AGENT_COMMANDS=compact       slash commands it announces when a session opens
//   AGENT_USAGE=1200/200000      the usage_update it sends with each reply (used/size)
//   AGENT_ECHO_MCP=1             the reply ends with the MCP servers its session was opened with
//   AGENT_MCP_HTTP=1             initialize advertises HTTP MCP servers
//   AGENT_STATS=1000             answers /session with its totals, as pi-acp does: a continued session starts at 1000 input tokens; each prompt adds 100 in, 10 out, $0.001
// It replays one old message on load, and its reply names the methods it was called with.
const readline = require("readline");

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
const supports = (process.env.AGENT_SUPPORTS ?? "").split(",").filter(Boolean);
const calls = [];
let continued = false;
let failedOnce = false;
let mcpServers = [];
let totals = { input: 0, output: 0, cost: 0 };

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
        agentCapabilities: {
          loadSession: supports.includes("load"),
          sessionCapabilities: supports.includes("resume") ? { resume: {} } : {},
          mcpCapabilities: { http: Boolean(process.env.AGENT_MCP_HTTP) },
        },
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
    if (process.env.AGENT_STATS) totals = { input: Number(process.env.AGENT_STATS), output: 100, cost: 0.05 };
    return send({ id: msg.id, result: {} });
  }
  if (msg.method === "session/prompt") {
    if (process.env.AGENT_STATS && msg.params.prompt[0]?.text === "/session") {
      say(msg.params.sessionId, `Messages: 3\nCost: ${totals.cost}\nTokens: in ${totals.input}, out ${totals.output}, total ${totals.input + totals.output}`);
      return send({ id: msg.id, result: { stopReason: "end_turn" } });
    }
    if (process.env.AGENT_STATS) totals = { input: totals.input + 100, output: totals.output + 10, cost: totals.cost + 0.001 };
    if (continued && process.env.AGENT_FAIL_FIRST_PROMPT && !failedOnce) {
      failedOnce = true;
      return send({ id: msg.id, error: { code: -32603, message: "service failure" } });
    }
    const echo = process.env.AGENT_ECHO_PROMPT ? ` | ${msg.params.prompt.map((block) => block.text).join("")}` : "";
    const mcp = process.env.AGENT_ECHO_MCP ? ` | mcp: ${mcpServers.map((server) => `${server.name}=${server.command ?? server.url}`).join(",")}` : "";
    say(msg.params.sessionId, `calls: ${calls.join(" ")}${echo}${mcp}`);
    if (process.env.AGENT_USAGE) {
      const [used, size] = process.env.AGENT_USAGE.split("/").map(Number);
      send({ method: "session/update", params: { sessionId: msg.params.sessionId, update: { sessionUpdate: "usage_update", used, size } } });
    }
    return send({ id: msg.id, result: { stopReason: "end_turn" } });
  }
});
