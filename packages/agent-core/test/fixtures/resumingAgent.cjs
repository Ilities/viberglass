// A scripted ACP agent for AcpClient session tests. Behaviour comes from env:
//   AGENT_SUPPORTS=load,resume   what initialize advertises
//   AGENT_KNOWS=sess_old         the session it can continue (others fail)
//   AGENT_FAIL_FIRST_PROMPT=1    the first prompt on a continued session fails
//   AGENT_ECHO_PROMPT=1          the reply ends with the prompt it got
//   AGENT_COMMANDS=compact       slash commands it announces when a session opens
//   AGENT_USAGE=1200/200000      the usage_update it sends with each reply (used/size)
//   AGENT_ECHO_MCP=1             the reply ends with the MCP servers its session was opened with
//   AGENT_MCP_HTTP=1             initialize advertises HTTP MCP servers
//   AGENT_MODEL=glm-5            the model its session replies name, as a model config option
//   AGENT_RESPONSE_MODEL=x       the model its usage_update names in _meta, as the model its replies came from
//   AGENT_PROMPT_USAGE=900/50/600 the usage each prompt's result reports (input/output/cache read)
//   AGENT_TURN_FAILURE=error:x   each prompt ends with this failure (severity:title) in its result's _meta, as codex-acp
//                                does for a client that asks for failures through the AIR extension
//   AGENT_STATS=1000             answers /session with its totals, as pi-acp does: a continued session starts at 1000 input tokens; each prompt adds 100 in, 10 out, $0.001
// It replays one old message on load, and its reply names the methods it was called with.
const readline = require("readline");

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
const sessionModel = () =>
  process.env.AGENT_MODEL
    ? { configOptions: [{ id: "model", category: "model", type: "select", currentValue: process.env.AGENT_MODEL, options: [] }] }
    : {};
const supports = (process.env.AGENT_SUPPORTS ?? "").split(",").filter(Boolean);
const calls = [];
let continued = false;
let failedOnce = false;
let mcpServers = [];
let totals = { input: 0, output: 0, cost: 0 };
let reportsFailures = false;

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
    const air = msg.params.clientCapabilities?._meta?.jetbrains?.air;
    reportsFailures = air?.version >= 1 && Array.isArray(air.capabilities) && air.capabilities.includes("sessionFailure");
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
    return send({ id: msg.id, result: { sessionId: "sess_new", ...sessionModel() } });
  }
  if (msg.method === "session/load" || msg.method === "session/resume") {
    if (msg.params.sessionId !== process.env.AGENT_KNOWS) return send({ id: msg.id, error: { code: -32002, message: "Resource not found" } });
    if (msg.method === "session/load") say(msg.params.sessionId, "an old reply, replayed");
    continued = true;
    if (process.env.AGENT_STATS) totals = { input: Number(process.env.AGENT_STATS), output: 100, cost: 0.05 };
    return send({ id: msg.id, result: sessionModel() });
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
      const meta = process.env.AGENT_RESPONSE_MODEL ? { _meta: { "_vendor/model": process.env.AGENT_RESPONSE_MODEL } } : {};
      send({ method: "session/update", params: { sessionId: msg.params.sessionId, update: { sessionUpdate: "usage_update", used, size, ...meta } } });
    }
    const usage = process.env.AGENT_PROMPT_USAGE?.split("/").map(Number);
    const promptUsage = usage ? { usage: { inputTokens: usage[0], outputTokens: usage[1], cachedReadTokens: usage[2], totalTokens: usage[0] + usage[1] } } : {};
    const failure = process.env.AGENT_TURN_FAILURE && reportsFailures ? process.env.AGENT_TURN_FAILURE.split(":") : null;
    const failureMeta = failure
      ? { _meta: { jetbrains: { air: { version: 1, sessionFailure: { id: "turn-1:error", revision: 1, category: "limit", severity: failure[0], title: failure.slice(1).join(":"), actions: ["retry"] } } } } }
      : {};
    return send({ id: msg.id, result: { stopReason: "end_turn", ...promptUsage, ...failureMeta } });
  }
});
