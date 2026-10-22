import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { stopAcpProcess } from "../src/acp/stopAcpProcess";

// A harness that, like codex-acp, leaves a helper behind which keeps writing for a while after stdin closes.
const HARNESS = `
const { spawn } = require("child_process");
const out = process.argv[1];
spawn(process.execPath, ["-e", \`
  setTimeout(() => require("fs").writeFileSync(\${JSON.stringify(out)}, "saved"), 500);
\`], { stdio: "ignore" });
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
`;

const IGNORES_STDIN = `
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`;

describe("stopAcpProcess", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stop-acp-")); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("waits for the processes the harness started, so what they write is on disk", async () => {
    const out = path.join(dir, "state");
    const child = spawn(process.execPath, ["-e", HARNESS, out], { stdio: ["pipe", "ignore", "ignore"], detached: true });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await stopAcpProcess(child, { saveMs: 5_000, termMs: 1_000 });

    expect(fs.readFileSync(out, "utf8")).toBe("saved");
  });

  it("kills a harness that won't stop", async () => {
    const child = spawn(process.execPath, ["-e", IGNORES_STDIN], { stdio: ["pipe", "ignore", "ignore"], detached: true });
    const exited = new Promise<NodeJS.Signals | null>((resolve) => child.on("exit", (_code, signal) => resolve(signal)));

    await stopAcpProcess(child, { saveMs: 200, termMs: 200 });

    expect(await exited).toBe("SIGKILL");
  });
});
