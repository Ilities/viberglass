import { findOpenCodeSessionId, parseOpenCodeRunJsonUsage, parseOpenCodeSessionExport } from "../src/usage";

const stepFinish = (part: Record<string, unknown>) =>
  JSON.stringify({ type: "step_finish", timestamp: 1790765724854, sessionID: "ses_1", part: { type: "step-finish", ...part } });

const tokens = (input: number, output: number, reasoning = 0, read = 0, write = 0) => ({
  total: input + output,
  input,
  output,
  reasoning,
  cache: { write, read },
});

const stream = (...lines: string[]) => lines.join("\n");

describe("parseOpenCodeRunJsonUsage", () => {
  it("reads a single-step run as opencode 1.18 prints it", () => {
    const usage = parseOpenCodeRunJsonUsage(
      stream(
        '{"type":"step_start","timestamp":1790765724119,"sessionID":"ses_1","part":{"id":"prt_1","messageID":"msg_1","sessionID":"ses_1","type":"step-start"}}',
        '{"type":"text","timestamp":1790765724854,"sessionID":"ses_1","part":{"id":"prt_2","messageID":"msg_1","sessionID":"ses_1","type":"text","text":"ok","time":{"start":1790765724820,"end":1790765724829}}}',
        '{"type":"step_finish","timestamp":1790765724854,"sessionID":"ses_1","part":{"id":"prt_3","reason":"stop","messageID":"msg_1","sessionID":"ses_1","type":"step-finish","tokens":{"total":7762,"input":7748,"output":14,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0.0011692}}',
      ),
    );

    expect(usage).toEqual({
      inputTokens: 7748,
      outputTokens: 14,
      reasoningOutputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUsd: 0.0011692,
      turns: 1,
      stopReason: "stop",
    });
  });

  it("sums tokens and cost across steps and takes the last stop reason", () => {
    const usage = parseOpenCodeRunJsonUsage(
      stream(
        stepFinish({ reason: "tool-calls", tokens: tokens(1000, 200, 50, 0, 900), cost: 0.01 }),
        JSON.stringify({ type: "tool_use", part: { tool: "bash" } }),
        stepFinish({ reason: "stop", tokens: tokens(300, 100, 0, 900, 0), cost: 0.002 }),
      ),
    );

    expect(usage).toMatchObject({
      inputTokens: 1300,
      outputTokens: 300,
      reasoningOutputTokens: 50,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 900,
      turns: 2,
      stopReason: "stop",
    });
    expect(usage?.costUsd).toBeCloseTo(0.012);
  });

  it("leaves cost out when opencode priced the run at zero", () => {
    const usage = parseOpenCodeRunJsonUsage(stepFinish({ reason: "stop", tokens: tokens(13235, 1541), cost: 0 }));

    expect(usage?.inputTokens).toBe(13235);
    expect(usage?.costUsd).toBeUndefined();
  });

  it("leaves out token fields no step reported", () => {
    const usage = parseOpenCodeRunJsonUsage(stepFinish({ reason: "stop", tokens: { input: 10, output: 5 } }));

    expect(usage).toMatchObject({ inputTokens: 10, outputTokens: 5, turns: 1 });
    expect(usage?.reasoningOutputTokens).toBeUndefined();
    expect(usage?.cacheReadInputTokens).toBeUndefined();
    expect(usage?.costUsd).toBeUndefined();
  });

  it("returns undefined when no step finished", () => {
    expect(
      parseOpenCodeRunJsonUsage(
        stream(
          JSON.stringify({ type: "step_start", part: { type: "step-start" } }),
          "not json",
          JSON.stringify({ type: "error", error: { name: "ProviderAuthError" } }),
        ),
      ),
    ).toBeUndefined();
  });
});

describe("findOpenCodeSessionId", () => {
  it("reads the session from the first event that names one", () => {
    expect(findOpenCodeSessionId(stream("not json", stepFinish({ reason: "stop" })))).toBe("ses_1");
  });

  it("returns undefined without events", () => {
    expect(findOpenCodeSessionId("")).toBeUndefined();
  });
});

describe("parseOpenCodeSessionExport", () => {
  const exported = (info: Record<string, unknown>) => JSON.stringify({ info, messages: [] });

  it("reads the model as provider/model and the CLI version, as opencode 1.18 exports them", () => {
    expect(
      parseOpenCodeSessionExport(
        exported({ id: "ses_1", agent: "build", model: { id: "glm-5.3-flash", providerID: "opencode-go", variant: "default" }, version: "1.18.25" }),
      ),
    ).toEqual({ model: "opencode-go/glm-5.3-flash", harnessVersion: "1.18.25" });
  });

  it("uses the bare model id when no provider is named", () => {
    expect(parseOpenCodeSessionExport(exported({ model: { id: "glm-5.3-flash" } })).model).toBe("glm-5.3-flash");
  });

  it("reads the model and version from an export cut short mid-transcript", () => {
    const full = JSON.stringify(
      { info: { id: "ses_1", model: { id: "deepseek-v4.1-flash", providerID: "opencode-go", variant: "default" }, version: "1.18.32", tokens: { input: 1 } }, messages: [{ info: { role: "user" } }] },
      null,
      2,
    );
    const truncated = full.slice(0, full.indexOf('"role"'));

    expect(parseOpenCodeSessionExport(truncated)).toEqual({ model: "opencode-go/deepseek-v4.1-flash", harnessVersion: "1.18.32" });
  });

  it("reports nothing for output it cannot read", () => {
    expect(parseOpenCodeSessionExport("Exporting session: ses_1")).toEqual({ model: undefined, harnessVersion: undefined });
    expect(parseOpenCodeSessionExport(exported({}))).toEqual({ model: undefined, harnessVersion: undefined });
  });
});
