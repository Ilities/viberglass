// A stdio MCP server for FakeMcpClient tests: its one tool echoes its arguments and the env it was given.
const readline = require("readline");
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.id === undefined) return;
  if (msg.method === "initialize") return send({ id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} } } });
  if (msg.method === "tools/call") {
    const text = `${msg.params.name} ${JSON.stringify(msg.params.arguments)} ${process.env.ECHO_SECRET ?? ""}`;
    return send({ id: msg.id, result: { content: [{ type: "text", text }] } });
  }
  send({ id: msg.id, error: { code: -32601, message: "Method not found" } });
});
