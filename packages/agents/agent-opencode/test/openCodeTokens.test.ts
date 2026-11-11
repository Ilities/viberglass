import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { openCodeTokens, writeOpenCodeTokenRecorder } from "../src/openCodeTokens";

/** Runs the recorder as OpenCode would, with these events from its bus. */
function emit(configDir: string, events: unknown[]): void {
  const plugin = pathToFileURL(path.join(configDir, "plugin", "viberglass-tokens.js")).href;
  const script = `
    const { ViberglassTokens } = await import(${JSON.stringify(plugin)});
    const hooks = await ViberglassTokens({});
    for (const event of ${JSON.stringify(events)}) await hooks.event({ event });
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script]);
}

const stepFinish = (sessionID: string, id: string, input: number, output: number, cacheRead: number, type = "message.part.updated") => ({
  type,
  properties: {
    sessionID,
    time: 0,
    part: { id, sessionID, messageID: `msg_${id}`, type: "step-finish", reason: "tool-calls", cost: 0.0003, tokens: { input, output, reasoning: 0, cache: { read: cacheRead, write: 0 } } },
  },
});

describe("OpenCode token recorder", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-config-"));
    writeOpenCodeTokenRecorder(configDir);
  });

  afterEach(() => fs.rmSync(configDir, { recursive: true, force: true }));

  it("adds up every model call in the session, not only the last", () => {
    const before = Date.now();
    emit(configDir, [
      stepFinish("ses_1", "prt_1", 1200, 80, 0),
      { type: "message.part.updated", properties: { sessionID: "ses_1", part: { id: "prt_t", type: "tool", tool: "bash" } } },
      stepFinish("ses_1", "prt_2", 410, 120, 29_000, "message.part.updated.1"),
      stepFinish("ses_1", "prt_3", 270, 40, 31_744),
      stepFinish("ses_2", "prt_4", 9999, 9999, 0),
    ]);

    expect(openCodeTokens(configDir).since("ses_1", before)).toEqual({
      inputTokens: 1880,
      outputTokens: 240,
      reasoningOutputTokens: 0,
      cacheReadInputTokens: 60_744,
      cacheCreationInputTokens: 0,
    });
  });

  it("counts a step OpenCode updated twice once, and leaves out earlier turns", async () => {
    emit(configDir, [stepFinish("ses_1", "prt_old", 5000, 500, 0)]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const turnStart = Date.now();
    emit(configDir, [stepFinish("ses_1", "prt_1", 100, 10, 0), stepFinish("ses_1", "prt_1", 100, 10, 0)]);

    expect(openCodeTokens(configDir).since("ses_1", turnStart)).toMatchObject({ inputTokens: 100, outputTokens: 10 });
  });

  it("has nothing for a session with no finished steps", () => {
    emit(configDir, [{ type: "session.status", properties: { sessionID: "ses_1", status: { type: "idle" } } }]);
    expect(openCodeTokens(configDir).since("ses_1", 0)).toBeNull();
  });
});
