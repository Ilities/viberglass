import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger } from "winston";
import type { ExecutionContext } from "@viberglass/agent-core";
import type { FakeConfig } from "../src/config";
import fakePlugin from "../src/plugin";
import { FakeAgent } from "../src";
import { planFakeTurn } from "../src/fakeTurnPlan";
import { FakeTurnRunner, FakeTurnIo } from "../src/FakeTurnRunner";
import { FakeAcpServer } from "../src/FakeAcpServer";

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
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
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

  it("reads sleep, no-document and fail directives", () => {
    const plan = planFakeTurn(
      "RESEARCH.md [fake:sleep=30] [fake:no-document] [fake:fail]",
    );
    expect(plan).toEqual({ documentFile: undefined, sleepSeconds: 30, fail: true });
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
    expect(message).toBe("Fake agent wrote RESEARCH.md.");
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
  function startServer() {
    const sent: Array<Record<string, unknown>> = [];
    const io = recordingIo();
    const server = new FakeAcpServer(
      (message) => sent.push(message),
      new FakeTurnRunner(io),
      "/default",
    );
    const request = (id: number, method: string, params: unknown) =>
      server.handleLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return { sent, io, request };
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

    await request(1, "session/load", { sessionId: "s1", cwd: "/work/repo" });
    await request(2, "session/prompt", {
      sessionId: "s1",
      prompt: [{ type: "text", text: "[fake:fail]" }],
    });

    expect(sent[1]).toMatchObject({
      id: 2,
      error: { message: "Fake agent failed on request" },
    });
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
