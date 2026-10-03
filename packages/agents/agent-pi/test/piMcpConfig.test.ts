import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { piAgentDirectory, writePiMcpConfig } from "../src/piMcpConfig";

describe("Pi's mcp.json", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mcp-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("lists the run's servers in Pi's format, offering the worker's own directly", () => {
    writePiMcpConfig(dir, [
      { name: "viberglass", command: "node", args: ["ask.js"], env: [{ name: "RELAY", value: "x" }] },
      { type: "http", name: "linear", url: "https://mcp.linear.app/mcp", headers: [{ name: "Authorization", value: "Bearer t" }] },
    ]);
    const file = path.join(dir, "mcp.json");
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({
      mcpServers: {
        viberglass: { command: "node", args: ["ask.js"], env: { RELAY: "x" }, exposure: "direct" },
        linear: { url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer t" } },
      },
    });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("removes an earlier run's file when this run has no servers", () => {
    writePiMcpConfig(dir, [{ type: "http", name: "a", url: "https://a", headers: [] }]);
    writePiMcpConfig(dir, []);
    expect(fs.existsSync(path.join(dir, "mcp.json"))).toBe(false);
  });

  it("uses the agent directory Pi was pointed at, else ~/.pi/agent", () => {
    expect(piAgentDirectory({ PI_CODING_AGENT_DIR: "/work/.harness-config/pi", HOME: "/home/v" })).toBe("/work/.harness-config/pi");
    expect(piAgentDirectory({ HOME: "/home/v" })).toBe("/home/v/.pi/agent");
  });
});
