import { AskHumanMcpServer } from "./AskHumanMcpServer";
import type { AskHumanInput } from "./askHumanTool";

function serverWith(ask: (input: AskHumanInput) => Promise<string>) {
  const sent: Array<Record<string, unknown>> = [];
  const server = new AskHumanMcpServer((message) => sent.push(message), ask);
  const call = async (id: number, method: string, params: Record<string, unknown> = {}) => {
    await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return sent.find((message) => message.id === id);
  };
  return { server, sent, call };
}

describe("AskHumanMcpServer", () => {
  it("introduces itself with tools, and lists ask_human", async () => {
    const { call } = serverWith(async () => "");
    expect(await call(1, "initialize", { protocolVersion: "2025-03-26" })).toMatchObject({
      result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "viberglass" } },
    });
    const listed = await call(2, "tools/list");
    expect(listed).toMatchObject({ result: { tools: [{ name: "ask_human", inputSchema: { required: ["question"] } }] } });
  });

  it("hands the question over and tells the agent what came back", async () => {
    const asked: AskHumanInput[] = [];
    const { call } = serverWith(async (input) => {
      asked.push(input);
      return "Your question is with Maria.";
    });
    const reply = await call(3, "tools/call", {
      name: "ask_human",
      arguments: { question: " Which warehouse? ", options: ["North", "", "South"], addressee: "requester" },
    });
    expect(asked).toEqual([{ question: "Which warehouse?", options: ["North", "South"], addressee: "requester", blocking: true }]);
    expect(reply).toEqual({ jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: "Your question is with Maria." }] } });
  });

  it("asks without blocking only when told to", async () => {
    const asked: AskHumanInput[] = [];
    const { call } = serverWith(async (input) => (asked.push(input), "ok"));
    await call(4, "tools/call", { name: "ask_human", arguments: { question: "Dark mode too?", blocking: false } });
    expect(asked[0]).toMatchObject({ blocking: false, addressee: null, options: [] });
  });

  it("answers a question it can't send with a tool error the agent can act on", async () => {
    const { call } = serverWith(async () => {
      throw new Error("platform unreachable");
    });
    const reply = await call(5, "tools/call", { name: "ask_human", arguments: { question: "Which?" } });
    expect(reply).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(reply)).toContain("platform unreachable");
    expect(await call(6, "tools/call", { name: "ask_human", arguments: {} })).toMatchObject({ result: { isError: true } });
  });

  it("ignores notifications and refuses methods it doesn't have", async () => {
    const { server, sent, call } = serverWith(async () => "");
    await server.handleLine(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(sent).toHaveLength(0);
    expect(await call(7, "resources/list")).toMatchObject({ error: { code: -32601 } });
  });
});
