// A scripted ACP agent for AcpClient session tests. Behaviour comes from env:
//   AGENT_SUPPORTS=load,resume   what initialize advertises
//   AGENT_KNOWS=sess_old         the session it can continue (others fail)
//   AGENT_FAIL_FIRST_PROMPT=1    the first prompt on a continued session fails
// It replays one old message on load, and its reply names the methods it was called with.
const readline = require("readline");

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
const supports = (process.env.AGENT_SUPPORTS ?? "").split(",").filter(Boolean);
const calls = [];
let continued = false;
let failedOnce = false;

const say = (sessionId, text) =>
  send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });

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
  if (msg.method === "session/new") return send({ id: msg.id, result: { sessionId: "sess_new" } });
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
    say(msg.params.sessionId, `calls: ${calls.join(" ")}`);
    return send({ id: msg.id, result: { stopReason: "end_turn" } });
  }
});
