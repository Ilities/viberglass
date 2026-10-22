import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { lastReplyError, piTurnError } from "../src/piTurnError";

const line = (entry: unknown) => JSON.stringify(entry);
const reply = (message: Record<string, unknown>) => line({ type: "message", id: "m", message: { role: "assistant", ...message } });
const user = line({ type: "message", id: "u", message: { role: "user", content: "Write the plan" } });

describe("lastReplyError", () => {
  it("reads the error a turn's model call ended with, as Pi records a rejected key", () => {
    const rejected = reply({ stopReason: "error", errorMessage: '401: {"message":"Incorrect API key provided."}' });
    expect(lastReplyError([line({ type: "session", id: "s" }), user, rejected, ""])).toBe('401: {"message":"Incorrect API key provided."}');
  });

  it("finds nothing when the last reply finished, even after an earlier error", () => {
    const lines = [user, reply({ stopReason: "error", errorMessage: "503" }), user, reply({ stopReason: "stop" })];
    expect(lastReplyError(lines)).toBeUndefined();
  });

  it("doesn't count a cancelled turn as an error", () => {
    expect(lastReplyError([user, reply({ stopReason: "aborted" })])).toBeUndefined();
  });

  it("says Pi stopped with an error when it recorded no message", () => {
    expect(lastReplyError([user, reply({ stopReason: "error" })])).toBe("Pi stopped with an error");
  });
});

describe("piTurnError", () => {
  it("reads the session's own file, named after its id", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sessions-"));
    fs.writeFileSync(path.join(dir, "2026-10-22T09-35-06-869Z_other.jsonl"), [user, reply({ stopReason: "error", errorMessage: "other" })].join("\n"));
    fs.writeFileSync(path.join(dir, "2026-10-22T09-35-06-869Z_sess-1.jsonl"), [user, reply({ stopReason: "error", errorMessage: "401" })].join("\n"));
    expect(piTurnError(dir, "sess-1")).toBe("401");
    expect(piTurnError(dir, "missing")).toBeUndefined();
    expect(piTurnError(path.join(dir, "absent"), "sess-1")).toBeUndefined();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
