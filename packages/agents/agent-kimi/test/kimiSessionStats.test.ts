import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { kimiUsageProbe, parseKimiSessionStats } from "../src/kimiSessionStats";

describe("parseKimiSessionStats", () => {
  it("reads the session's output tokens from Kimi's /usage answer, not its input, which has cached tokens in it", () => {
    const answer = "Context: 8353 / 32768 tokens (25%)\nSession total: 32529 input, 205 output";
    expect(parseKimiSessionStats(answer)).toEqual({ outputTokens: 205 });
  });

  it("reads the output when Kimi doesn't know the input", () => {
    expect(parseKimiSessionStats("Context: 8353 tokens\nSession total: input unknown, 887 output")).toEqual({ outputTokens: 887 });
  });

  it("reads counts written with thousands separators", () => {
    expect(parseKimiSessionStats("Session total: 1,032,529 input, 2,205 output")).toEqual({ outputTokens: 2205 });
  });

  it("finds nothing in an answer without the session's totals", () => {
    expect(parseKimiSessionStats("Context: 8353 / 32768 tokens (25%)")).toBeNull();
  });
});

describe("kimiUsageProbe", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-home-"));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  function writeWire(agent: string, records: unknown[]): void {
    const directory = path.join(home, "sessions", "ws_1", "sess_1", "agents", agent);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "wire.jsonl"), records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  }

  const usage = (inputOther: number, output: number, inputCacheRead: number | undefined, inputCacheCreation = 0) => ({
    type: "usage.record",
    time: 1,
    agentId: "main",
    model: "kimi-code/kimi-for-coding",
    usage: { inputOther, output, inputCacheRead, inputCacheCreation },
    usageScope: "turn",
  });

  it("adds up every model call in the session's logs, subagents included, with cached input apart", () => {
    writeWire("main", [{ type: "context.append_message", time: 1 }, usage(1200, 300, 8000), usage(400, 587, undefined, 50), "not json"]);
    writeWire("sub_1", [usage(100, 0, 900)]);

    const probe = kimiUsageProbe(home);
    expect(probe.parse("Session total: input unknown, 887 output", "sess_1")).toEqual({
      inputTokens: 1700,
      outputTokens: 887,
      cacheReadInputTokens: 8900,
      cacheCreationInputTokens: 50,
    });
  });

  it("reads Kimi's answer when the session has no logs", () => {
    expect(kimiUsageProbe(home).parse("Session total: input unknown, 887 output", "sess_other")).toEqual({ outputTokens: 887 });
  });
});
