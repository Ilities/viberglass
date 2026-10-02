import { describe, expect, it, jest } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FakeAcpServer } from "../src/FakeAcpServer";
import { FakeMcpClient, type McpServerSpec } from "../src/FakeMcpClient";
import { FakeSessionStore } from "../src/FakeSessionStore";
import { FakeTurnRunner, type FakeTurnIo } from "../src/FakeTurnRunner";

function sessionIdOf(message: Record<string, unknown>): string {
  const result = message.result;
  if (typeof result === "object" && result !== null && "sessionId" in result) {
    return String(result.sessionId);
  }
  throw new Error("session/new returned no sessionId");
}

function recordingIo(): FakeTurnIo & {
  files: Map<string, string>;
  sleeps: number[];
} {
  const files = new Map<string, string>();
  const sleeps: number[] = [];
  return {
    files,
    sleeps,
    writeFile: async (filePath, contents) => {
      files.set(filePath, contents);
    },
    appendFile: async (filePath, contents) => {
      files.set(filePath, (files.get(filePath) ?? "") + contents);
    },
    exists: (filePath) => files.has(filePath),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
}

describe("FakeAcpServer, asking a question", () => {
  const ASK_SERVER: McpServerSpec = { name: "viberglass", command: "node", args: ["ask.js"], env: [] };

  function startAsking(reply = "Your question is with Maria.") {
    const sent: Array<Record<string, unknown>> = [];
    const io = recordingIo();
    const mcp = { callTool: jest.fn(async () => reply) };
    const server = new FakeAcpServer(
      (message) => sent.push(message),
      new FakeTurnRunner(io),
      "/default",
      new FakeSessionStore(fs.mkdtempSync(path.join(os.tmpdir(), "fake-state-"))),
      mcp,
    );
    const request = (id: number, method: string, params: unknown) => server.handleLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    const said = () =>
      sent
        .map((message) => JSON.stringify(message))
        .filter((line) => line.includes("agent_message_chunk"))
        .join("\n");
    return { sent, io, mcp, request, said };
  }

  it("asks with the session's ask_human tool and stops until it's answered", async () => {
    const { sent, io, mcp, request, said } = startAsking();
    await request(1, "session/new", { cwd: "/work/repo", mcpServers: [ASK_SERVER] });
    await request(2, "session/prompt", {
      sessionId: sessionIdOf(sent[1]),
      prompt: [{ type: "text", text: "Write RESEARCH.md [fake:ask=Which warehouse?|North|South] [fake:ask-of=requester]" }],
    });

    expect(mcp.callTool).toHaveBeenCalledWith(ASK_SERVER, "ask_human", {
      question: "Which warehouse?",
      options: ["North", "South"],
      blocking: true,
      addressee: "requester",
    });
    expect(said()).toContain("Waiting on an answer: fake agent, turn 1.");
    expect(said()).toContain("Your question is with Maria.");
    expect(io.files.size).toBe(0);
  });

  it("carries on after a question that doesn't block", async () => {
    const { sent, io, request, said } = startAsking("Carry on.");
    await request(1, "session/new", { cwd: "/work/repo", mcpServers: [ASK_SERVER] });
    await request(2, "session/prompt", { sessionId: sessionIdOf(sent[1]), prompt: [{ type: "text", text: "Write RESEARCH.md [fake:ask-later=Dark mode too?]" }] });

    expect(io.files.has(path.join("/work/repo", "RESEARCH.md"))).toBe(true);
    expect(said()).toContain("Carry on.");
  });

  it("says so when the session has no tool to ask with", async () => {
    const { sent, mcp, request, said } = startAsking();
    await request(1, "session/new", { cwd: "/work/repo", mcpServers: [] });
    await request(2, "session/prompt", { sessionId: sessionIdOf(sent[1]), prompt: [{ type: "text", text: "[fake:ask=Which?]" }] });
    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(said()).toContain("Fake agent had no ask_human tool to ask: Which?");
  });
});

describe("FakeMcpClient", () => {
  it("starts the server with its env and calls the tool", async () => {
    const server: McpServerSpec = {
      name: "echo",
      command: process.execPath,
      args: [path.join(__dirname, "fixtures", "echoMcpServer.cjs")],
      env: [{ name: "ECHO_SECRET", value: "s3cret" }],
    };
    expect(await new FakeMcpClient(5_000).callTool(server, "ask_human", { question: "Which?" })).toBe('ask_human {"question":"Which?"} s3cret');
  });
});
