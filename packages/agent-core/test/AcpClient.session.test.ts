import * as path from "path";
import { createLogger, transports } from "winston";
import { AcpClient } from "../src/acp/AcpClient";
import type { PlatformSessionEvent } from "../src/acp/types";

const AGENT_SCRIPT = path.join(process.cwd(), "test", "fixtures", "resumingAgent.cjs");

async function runTurn(env: Record<string, string>, acpSessionId?: string, coldStartMessage?: string, compactInstructions?: string) {
  const events: PlatformSessionEvent[] = [];
  const client = new AcpClient(
    [process.execPath, AGENT_SCRIPT],
    process.cwd(),
    { ...process.env, ...env },
    (event) => events.push(event),
    createLogger({ transports: [new transports.Console({ silent: true })] }),
    10_000,
  );
  const result = await client.run({ userMessage: "Carry on", acpSessionId, coldStartMessage, compactInstructions });
  const replies = events.filter((event) => event.eventType === "assistant_message").map((event) => String(event.payload.text));
  const progress = events.filter((event) => event.eventType === "progress").map((event) => String(event.payload.text));
  return { result, replies, progress };
}

describe("AcpClient sessions", () => {
  it("starts a session on the first turn and says so", async () => {
    const { result, progress } = await runTurn({ AGENT_SUPPORTS: "load,resume" });
    expect(result.sessionStart).toEqual({ resumed: false, reason: "first_turn" });
    expect(result.acpSessionId).toBe("sess_new");
    expect(progress).toContain("Started the agent's session");
  });

  it("prefers session/resume, which doesn't replay history", async () => {
    const { result, replies } = await runTurn({ AGENT_SUPPORTS: "load,resume", AGENT_KNOWS: "sess_old" }, "sess_old");
    expect(result.sessionStart).toEqual({ resumed: true, via: "resume" });
    expect(result.acpSessionId).toBe("sess_old");
    expect(replies).toEqual(["calls: initialize session/resume session/prompt"]);
  });

  it("loads when that's all the agent offers, and drops the replayed history", async () => {
    const { result, replies, progress } = await runTurn({ AGENT_SUPPORTS: "load", AGENT_KNOWS: "sess_old" }, "sess_old");
    expect(result.sessionStart).toEqual({ resumed: true, via: "load" });
    expect(replies).toEqual(["calls: initialize session/load session/prompt"]);
    expect(progress).toContain("Continued the agent's earlier session");
  });

  it("starts cold, and says why, when the agent can't continue a session", async () => {
    const { result, replies } = await runTurn({ AGENT_SUPPORTS: "" }, "sess_old");
    expect(result.sessionStart).toEqual({ resumed: false, reason: "not_supported" });
    expect(replies).toEqual(["calls: initialize session/new session/prompt"]);
  });

  it("starts cold when the earlier session is gone", async () => {
    const { result, progress } = await runTurn({ AGENT_SUPPORTS: "resume", AGENT_KNOWS: "sess_other" }, "sess_old");
    expect(result.sessionStart).toEqual({ resumed: false, reason: "failed", detail: "Resource not found" });
    expect(result.acpSessionId).toBe("sess_new");
    expect(progress).toContain("Started a fresh agent session: the earlier one couldn't be continued");
  });

  it("starts over cold when a continued session fails its first prompt", async () => {
    const { result, replies } = await runTurn(
      { AGENT_SUPPORTS: "load", AGENT_KNOWS: "sess_old", AGENT_FAIL_FIRST_PROMPT: "1" },
      "sess_old",
    );
    expect(result.sessionStart).toEqual({ resumed: false, reason: "failed", detail: "service failure" });
    expect(result.acpSessionId).toBe("sess_new");
    expect(replies).toEqual(["calls: initialize session/load session/prompt session/new session/prompt"]);
  });

  describe("with a prompt for a cold start", () => {
    const COLD = "The task so far, then: Carry on";

    it("sends a continued session only the turn", async () => {
      const { replies } = await runTurn({ AGENT_SUPPORTS: "resume", AGENT_KNOWS: "sess_old", AGENT_ECHO_PROMPT: "1" }, "sess_old", COLD);
      expect(replies).toEqual(["calls: initialize session/resume session/prompt | Carry on"]);
    });

    it("sends a session that couldn't continue the task so far", async () => {
      const { replies } = await runTurn({ AGENT_SUPPORTS: "", AGENT_ECHO_PROMPT: "1" }, "sess_old", COLD);
      expect(replies).toEqual([`calls: initialize session/new session/prompt | ${COLD}`]);
    });

    it("sends it again when a continued session fails its first prompt and starts over", async () => {
      const { replies } = await runTurn(
        { AGENT_SUPPORTS: "load", AGENT_KNOWS: "sess_old", AGENT_FAIL_FIRST_PROMPT: "1", AGENT_ECHO_PROMPT: "1" },
        "sess_old",
        COLD,
      );
      expect(replies).toEqual([`calls: initialize session/load session/prompt session/new session/prompt | ${COLD}`]);
    });
  });

  describe("context and compaction", () => {
    it("reports how full the harness's context is", async () => {
      const { result } = await runTurn({ AGENT_SUPPORTS: "", AGENT_USAGE: "150000/200000" });
      expect(result.contextUsage).toEqual({ used: 150000, size: 200000 });
    });

    it("compacts with our instructions after the turn, using the command the harness announced", async () => {
      const { result, replies } = await runTurn({ AGENT_SUPPORTS: "", AGENT_COMMANDS: "help,compress", AGENT_ECHO_PROMPT: "1" }, undefined, undefined, "Keep the decisions");
      expect(result.compacted).toBe(true);
      expect(replies.at(-1)).toContain("| /compress Keep the decisions");
    });

    it("doesn't compact a harness without a compact command, or when nobody asked", async () => {
      expect((await runTurn({ AGENT_SUPPORTS: "" }, undefined, undefined, "Keep the decisions")).result.compacted).toBe(false);
      expect((await runTurn({ AGENT_SUPPORTS: "", AGENT_COMMANDS: "compact" })).result.compacted).toBe(false);
    });
  });
});
