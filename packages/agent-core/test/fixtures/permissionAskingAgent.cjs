// A minimal ACP agent for AcpClient tests: on session/prompt it asks for
// permission with OpenCode's option ids, then reports the reply it got as its
// assistant message before ending the turn.
const readline = require("readline");

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
const PERMISSION_REQUEST_ID = 900;
let promptRequestId;

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") return send({ id: msg.id, result: { protocolVersion: 1 } });
  if (msg.method === "session/new") return send({ id: msg.id, result: { sessionId: "sess_1" } });
  if (msg.method === "session/prompt") {
    promptRequestId = msg.id;
    return send({
      id: PERMISSION_REQUEST_ID,
      method: "session/request_permission",
      params: {
        sessionId: "sess_1",
        toolCall: { toolCallId: "call_1", title: "external_directory /tmp/other" },
        options: [
          { optionId: "once", name: "Allow once", kind: "allow_once" },
          { optionId: "always", name: "Always allow", kind: "allow_always" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      },
    });
  }
  if (msg.id === PERMISSION_REQUEST_ID) {
    send({
      method: "session/update",
      params: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: JSON.stringify(msg.result) },
        },
      },
    });
    return send({ id: promptRequestId, result: { stopReason: "end_turn" } });
  }
});
