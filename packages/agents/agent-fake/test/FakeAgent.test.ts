import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger } from "winston";
import type { ExecutionContext } from "@viberglass/agent-core";
import type { FakeConfig } from "../src/config";
import fakePlugin from "../src/plugin";
import { FakeAgent } from "../src";
import { planFakeTurn, renderFakeDocument } from "../src/fakeTurnPlan";
import { FakeTurnRunner, FakeTurnIo } from "../src/FakeTurnRunner";
import { FakeAcpServer } from "../src/FakeAcpServer";
import { FakeSessionStore } from "../src/FakeSessionStore";

const logger = createLogger({ silent: true });

function fakeConfig(): FakeConfig {
  return {
    name: "fake",
    apiKey: "",
    capabilities: [],
    costPerExecution: 0,
    averageSuccessRate: 1,
    executionTimeLimit: 60,
    resourceLimits: {
      maxMemoryMB: 256,
      maxCpuPercent: 50,
      maxDiskSpaceMB: 128,
      maxNetworkRequests: 0,
    },
  };
}

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

/** A task turn's prompt, as the `task_turn` template lays it out. */
function turnPrompt(parts: { task?: string; thread?: string; whatToDo: string }): string {
  return [
    parts.task ? `<task>\n<description>${parts.task}</description>\n</task>` : "",
    parts.thread ? `<thread>\n${parts.thread}\n</thread>` : "",
    `<what-to-do>\n${parts.whatToDo}\n</what-to-do>`,
    "How to work:\n- The research and the plan live in RESEARCH.md and PLAN.md.",
  ].join("\n\n");
}

describe("planFakeTurn", () => {
  it("writes RESEARCH.md for research prompts", () => {
    expect(planFakeTurn("Write your output to RESEARCH.md").documentFile).toBe(
      "RESEARCH.md",
    );
  });

  it("prefers PLAN.md when a planning prompt embeds research", () => {
    const prompt = "Write PLAN.md.\n<approved-research>RESEARCH.md</approved-research>";
    expect(planFakeTurn(prompt).documentFile).toBe("PLAN.md");
  });

  it("writes SUMMARY.md when a turn asks for the summary", () => {
    expect(planFakeTurn("<what-to-do>\nSummarise the conversation in SUMMARY.md\n</what-to-do>").documentFile).toBe("SUMMARY.md");
  });

  it("reads sleep, no-document, code and fail directives", () => {
    const plan = planFakeTurn(
      "RESEARCH.md [fake:sleep=30] [fake:no-document] [fake:code] [fake:fail]",
    );
    expect(plan).toEqual({ documentFile: undefined, code: true, sleepSeconds: 30, sleepAfterSeconds: 0, fail: true, usageTokens: null, ask: null });
  });

  it("in a task turn, writes the document the turn was asked for, not the ones its rules mention", () => {
    expect(planFakeTurn(turnPrompt({ whatToDo: "Write the plan: write PLAN.md" })).documentFile).toBe("PLAN.md");
    expect(planFakeTurn(turnPrompt({ whatToDo: "Revise the research in RESEARCH.md" })).documentFile).toBe("RESEARCH.md");
    expect(planFakeTurn(turnPrompt({ whatToDo: "Answer what was asked above." })).documentFile).toBeUndefined();
  });

  it("when asked to answer, writes what people asked for in the thread", () => {
    const prompt = turnPrompt({ thread: "<message>Now write it up in RESEARCH.md.</message>", whatToDo: "Answer what was asked above." });
    expect(planFakeTurn(prompt).documentFile).toBe("RESEARCH.md");
  });

  it("takes directives only from people's words, not from documents quoted back to it", () => {
    const quoted = `<current-research>${renderFakeDocument("RESEARCH.md", "[fake:fail] [fake:sleep=9]", 1)}</current-research>`;
    const prompt = `${quoted}\n\n${turnPrompt({ task: "Fix it [fake:code]", thread: "<message>Build it</message>", whatToDo: "Build it" })}`;

    expect(planFakeTurn(prompt)).toEqual({ documentFile: undefined, code: true, sleepSeconds: 0, sleepAfterSeconds: 0, fail: false, usageTokens: null, ask: null });
  });

  it("reads a question to ask, with its options and whom to ask, blocking unless asked later", () => {
    expect(planFakeTurn("[fake:ask=Which warehouse?|North|South] [fake:ask-of=requester]").ask).toEqual({
      question: "Which warehouse?",
      options: ["North", "South"],
      addressee: "requester",
      blocking: true,
    });
    expect(planFakeTurn("[fake:ask-later=Dark mode too?]").ask).toEqual({ question: "Dark mode too?", options: [], addressee: null, blocking: false });
  });
});

describe("FakeTurnRunner", () => {
  it("sleeps, then writes a document that echoes the prompt", async () => {
    const io = recordingIo();
    const message = await new FakeTurnRunner(io).run(
      "RESEARCH.md please [fake:sleep=2] PM NOTE",
      "/repo",
    );

    expect(io.sleeps).toEqual([2000]);
    expect(io.files.get(path.join("/repo", "RESEARCH.md"))).toContain("PM NOTE");
    expect(message).toBe("Writing the research: fake agent, turn 1.\n\nFake agent wrote RESEARCH.md.");
  });

  it("writes the document before waiting, when told to wait after", async () => {
    const io = recordingIo();
    const order: string[] = [];
    const runner = new FakeTurnRunner({
      ...io,
      writeFile: async (filePath, contents) => {
        order.push("write");
        await io.writeFile(filePath, contents);
      },
      sleep: async (ms) => {
        order.push(`sleep ${ms}`);
      },
    });
    await runner.run("RESEARCH.md [fake:sleep-after=5]", "/repo");
    expect(order).toEqual(["write", "sleep 5000"]);
  });

  it("says it's revising a document that's already there, and which turn it's on", async () => {
    const io = recordingIo();
    io.files.set(path.join("/repo", "PLAN.md"), "# Plan v1");

    const message = await new FakeTurnRunner(io).run(turnPrompt({ whatToDo: "Revise the plan in PLAN.md" }), "/repo", 3);

    expect(message.split("\n")[0]).toBe("Revising the plan: fake agent, turn 3.");
    expect(io.files.get(path.join("/repo", "PLAN.md"))).toContain("This is turn 3 of its session");
  });

  it("changes code when told to, and answers when there's nothing to write", async () => {
    const io = recordingIo();
    const runner = new FakeTurnRunner(io);

    expect(await runner.run(turnPrompt({ thread: "<message>Go [fake:code]</message>", whatToDo: "Build it" }), "/repo", 2)).toBe(
      "Making the change: fake agent, turn 2.\n\nFake agent changed fake-change.txt.",
    );
    expect(io.files.get(path.join("/repo", "fake-change.txt"))).toBe("Changed by the fake agent on turn 2.\n");
    expect(await runner.run(turnPrompt({ whatToDo: "Answer what was asked above." }), "/repo")).toMatch(/^Answering: /);
  });

  it("fails on request without writing anything", async () => {
    const io = recordingIo();
    await expect(
      new FakeTurnRunner(io).run("RESEARCH.md [fake:fail]", "/repo"),
    ).rejects.toThrow("Fake agent failed on request");
    expect(io.files.size).toBe(0);
  });
});

describe("FakeAcpServer", () => {
  function startServer(stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-state-"))) {
    const sent: Array<Record<string, unknown>> = [];
    const announced: Array<Record<string, unknown>> = [];
    const io = recordingIo();
    const isAnnouncement = (message: Record<string, unknown>) => JSON.stringify(message).includes('"available_commands_update"');
    const server = new FakeAcpServer(
      (message) => (isAnnouncement(message) ? announced : sent).push(message),
      new FakeTurnRunner(io),
      "/default",
      new FakeSessionStore(stateDir),
    );
    const request = (id: number, method: string, params: unknown) =>
      server.handleLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return { sent, announced, io, request, stateDir };
  }

  it("runs a prompt in the session's cwd and ends the turn", async () => {
    const { sent, io, request } = startServer();

    await request(1, "initialize", { protocolVersion: 1 });
    await request(2, "session/new", { cwd: "/work/repo", mcpServers: [] });
    const sessionId = sessionIdOf(sent[1]);
    await request(3, "session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: "Write PLAN.md" }],
    });

    expect(io.files.has(path.join("/work/repo", "PLAN.md"))).toBe(true);
    expect(sent[2]).toMatchObject({
      method: "session/update",
      params: { update: { sessionUpdate: "agent_message_chunk" } },
    });
    expect(sent[3]).toEqual({
      jsonrpc: "2.0",
      id: 3,
      result: { stopReason: "end_turn" },
    });
  });

  it("returns a JSON-RPC error when the turn fails", async () => {
    const { sent, request } = startServer();

    await request(1, "session/new", { cwd: "/work/repo" });
    await request(2, "session/prompt", {
      sessionId: sessionIdOf(sent[0]),
      prompt: [{ type: "text", text: "[fake:fail]" }],
    });

    expect(sent[1]).toMatchObject({
      id: 2,
      error: { message: "Fake agent failed on request" },
    });
  });

  it("continues a session in a later process from its state, and can't load one whose state is gone", async () => {
    const first = startServer();
    await first.request(1, "session/new", { cwd: "/work/repo" });
    const sessionId = sessionIdOf(first.sent[0]);
    await first.request(2, "session/prompt", { sessionId, prompt: [{ type: "text", text: "Write RESEARCH.md" }] });

    const later = startServer(first.stateDir);
    await later.request(1, "session/load", { sessionId, cwd: "/work/repo" });
    await later.request(2, "session/prompt", { sessionId, prompt: [{ type: "text", text: "Write RESEARCH.md" }] });
    expect(later.sent[0]).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(later.io.files.get(path.join("/work/repo", "RESEARCH.md"))).toContain("This is turn 2 of its session");

    const elsewhere = startServer();
    await elsewhere.request(1, "session/load", { sessionId, cwd: "/work/repo" });
    expect(elsewhere.sent[0]).toMatchObject({ id: 1, error: { message: "Resource not found" } });
  });

  it("announces a compact command, answers it without a turn, and reports usage when told to", async () => {
    const { sent, announced, io, request } = startServer();
    await request(1, "session/new", { cwd: "/work/repo", mcpServers: [] });
    const sessionId = sessionIdOf(sent[0]);
    expect(announced[0]).toMatchObject({ params: { update: { availableCommands: [{ name: "compact" }] } } });

    await request(2, "session/prompt", { sessionId, prompt: [{ type: "text", text: "Write SUMMARY.md [fake:usage=150000]" }] });
    expect(io.files.get(path.join("/work/repo", "SUMMARY.md"))).toContain("# Fake Summary");
    expect(sent).toContainEqual(expect.objectContaining({ params: { sessionId, update: { sessionUpdate: "usage_update", used: 150000, size: 200000 } } }));

    await request(3, "session/prompt", { sessionId, prompt: [{ type: "text", text: "/compact Keep the decisions" }] });
    expect(sent).toContainEqual(expect.objectContaining({ params: { sessionId, update: expect.objectContaining({ content: { type: "text", text: "Compacted the conversation." } }) } }));
  });

  it("rejects methods it does not support", async () => {
    const { sent, request } = startServer();
    await request(1, "unknown/method", {});
    expect(sent[0]).toMatchObject({ id: 1, error: { code: -32000 } });
  });
});

describe("FakeAgent", () => {
  it("creates an agent instance from the plugin", () => {
    const agent = fakePlugin.create(
      fakeConfig(),
      logger,
    );
    expect(agent).toBeInstanceOf(FakeAgent);
  });

  it("points the ACP command at the bundled fake server", () => {
    const agent = fakePlugin.create(
      fakeConfig(),
      logger,
    );
    const [node, script] = agent.getAcpServerCommand();
    expect(node).toBe(process.execPath);
    expect(path.basename(script)).toBe("fakeAcpServerMain.js");
  });

  it("writes the document into an already cloned repository", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-agent-"));
    const repoDir = path.join(workDir, "repo");
    fs.mkdirSync(repoDir);
    const agent = fakePlugin.create(
      fakeConfig(),
      logger,
    );

    const context: ExecutionContext = {
      repoUrl: "http://git.invalid/repo.git",
      branch: "main",
      repoDir,
      commitHash: "",
      bugDescription: "",
      stepsToReproduce: "",
      expectedBehavior: "",
      actualBehavior: "",
      maxChanges: 1,
      testRequired: false,
      runTests: false,
      maxExecutionTime: 60,
    };
    const result = await agent.execute("Write RESEARCH.md", context);

    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(repoDir, "RESEARCH.md"), "utf-8")).toContain(
      "Write RESEARCH.md",
    );
    fs.rmSync(workDir, { recursive: true, force: true });
  });
});
