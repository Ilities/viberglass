import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Logger } from "winston";

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "session-state-"));
process.env.SESSION_STATE_ROOT = stateRoot;
delete process.env.AWS_S3_BUCKET;
// Imported after the env is set: the module reads SESSION_STATE_ROOT once.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { captureAndStore, retrieveAndRestore } = require("./SessionStateManager") as typeof import("./SessionStateManager");

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as Logger;

function write(home: string, relative: string, contents: string) {
  const full = path.join(home, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

describe("SessionStateManager", () => {
  afterAll(() => fs.rmSync(stateRoot, { recursive: true, force: true }));

  it("carries a harness's sessions to the next turn's home, but not its credentials", async () => {
    const turnOne = fs.mkdtempSync(path.join(os.tmpdir(), "home-a-"));
    const turnTwo = fs.mkdtempSync(path.join(os.tmpdir(), "home-b-"));
    write(turnOne, ".local/share/opencode/opencode.db", "sessions");
    write(turnOne, ".local/share/opencode/auth.json", "secret token");
    write(turnOne, ".local/share/opencode/log/opencode.log", "noise");
    write(turnOne, ".opencode/opencode.json", "config written each run");

    const url = await captureAndStore("opencode", "session-1", turnOne, logger);
    expect(url).toMatch(/^file:\/\//);
    await retrieveAndRestore(url!, turnTwo, logger);

    expect(fs.readFileSync(path.join(turnTwo, ".local/share/opencode/opencode.db"), "utf-8")).toBe("sessions");
    expect(fs.existsSync(path.join(turnTwo, ".local/share/opencode/auth.json"))).toBe(false);
    expect(fs.existsSync(path.join(turnTwo, ".local/share/opencode/log"))).toBe(false);
    expect(fs.existsSync(path.join(turnTwo, ".opencode"))).toBe(false);
  });

  it("stores nothing when the harness has no state yet", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "home-empty-"));
    expect(await captureAndStore("opencode", "session-2", home, logger)).toBeUndefined();
  });
});
