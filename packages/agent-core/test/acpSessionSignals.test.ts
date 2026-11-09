import { contextUsageOf, promptUsageOf, responseModelOf } from "../src/acp/acpSessionSignals";

describe("promptUsageOf", () => {
  it("counts cached tokens as part of the context, as harnesses that cache report them apart", () => {
    expect(promptUsageOf({ usage: { inputTokens: 312, outputTokens: 900, cachedReadTokens: 41_000, cachedWriteTokens: 2_000 } })).toEqual({
      used: 43_312,
      size: null,
    });
  });

  it("reads input tokens alone when nothing was cached, and the total when there are no input tokens", () => {
    expect(promptUsageOf({ usage: { inputTokens: 5_000 } })).toEqual({ used: 5_000, size: null });
    expect(promptUsageOf({ usage: { totalTokens: 7_000 } })).toEqual({ used: 7_000, size: null });
    expect(promptUsageOf({ stopReason: "end_turn" })).toBeNull();
  });
});

describe("contextUsageOf", () => {
  it("reads a usage_update's tokens and window", () => {
    expect(contextUsageOf({ update: { sessionUpdate: "usage_update", used: 43_000, size: 128_000 } })).toEqual({ used: 43_000, size: 128_000 });
  });
});

describe("responseModelOf", () => {
  it("reads the model a usage_update names in its _meta, plain or namespaced", () => {
    expect(responseModelOf({ update: { sessionUpdate: "usage_update", used: 1, _meta: { "_claude/model": "claude-haiku-5-5" } } })).toBe("claude-haiku-5-5");
    expect(responseModelOf({ update: { sessionUpdate: "usage_update", used: 1, _meta: { model: "glm-5.3" } } })).toBe("glm-5.3");
  });

  it("ignores other updates and other _meta keys", () => {
    expect(responseModelOf({ update: { sessionUpdate: "usage_update", used: 1, _meta: { "_claude/origin": "x" } } })).toBeUndefined();
    expect(responseModelOf({ update: { sessionUpdate: "agent_message_chunk", _meta: { model: "glm-5.3" } } })).toBeUndefined();
    expect(responseModelOf({ update: { sessionUpdate: "usage_update", used: 1 } })).toBeUndefined();
  });
});
