import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { openCodeRetries, writeOpenCodeRetryRecorder } from "../src/openCodeRetries";

/** Runs the recorder as OpenCode would, with these events from its bus. */
function emit(configDir: string, events: unknown[]): void {
  const plugin = pathToFileURL(path.join(configDir, "plugin", "viberglass-retries.js")).href;
  const script = `
    const { ViberglassRetries } = await import(${JSON.stringify(plugin)});
    const hooks = await ViberglassRetries({});
    for (const event of ${JSON.stringify(events)}) await hooks.event({ event });
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script]);
}

const retry = (sessionID: string, next: number) => ({
  type: "session.status",
  properties: {
    sessionID,
    status: {
      type: "retry",
      attempt: 1,
      message: "5h usage limit reached. It will reset in 2 hours 14 minutes.",
      action: { reason: "account_rate_limit" },
      next,
    },
  },
});

describe("OpenCode retry recorder", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-config-"));
    writeOpenCodeRetryRecorder(configDir);
  });

  afterEach(() => fs.rmSync(configDir, { recursive: true, force: true }));

  it("records a retry OpenCode waits for, which the worker reads back for its session", () => {
    const before = Date.now();
    emit(configDir, [
      { type: "session.status", properties: { sessionID: "ses_1", status: { type: "busy" } } },
      retry("ses_1", before + 8_000_000),
      retry("ses_2", before + 1_000),
    ]);

    const latest = openCodeRetries(configDir).latest("ses_1");
    expect(latest).toEqual({
      at: expect.any(Number),
      retryAt: before + 8_000_000,
      error: "5h usage limit reached. It will reset in 2 hours 14 minutes.",
    });
    expect(latest!.at).toBeGreaterThanOrEqual(before);
  });

  it("has nothing for a session that never waited", () => {
    emit(configDir, [{ type: "session.status", properties: { sessionID: "ses_1", status: { type: "idle" } } }]);
    expect(openCodeRetries(configDir).latest("ses_1")).toBeUndefined();
  });
});
